import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Routes WebSearch and WebFetch through the ketch CLI when it is installed.
// Without ketch the mod does nothing. When ketch fails, the built-in tool runs.

const NAME = 'ketch-first'

// The user's switch for this session: /ketch-first off, /ketch-first on.
const isOff = atom({ plugin: 'ketch-first', key: 'isOff' } as const, false)

// The model's override: the same call again within this time runs the built-in tool.
const REPEAT_MS = 10 * 60 * 1000
const recent = new Map<string, number>()

const SEARCH_TIMEOUT_MS = 30_000
const FETCH_TIMEOUT_MS = 60_000
// The most page text one WebFetch answer holds. `offset` reads on from there.
const PAGE_CHARS = 40_000

// The path of the ketch binary, or undefined when it is not installed.
// One file check per call: cheap enough to need no cache.
export async function findKetch($: EngineInterface): Promise<string | undefined> {
  const home = await $.env.get('HOME').catch(() => undefined)
  const local = home ? `${home}/.local/bin/ketch` : undefined
  if (local && (await $.fs.exists(local).catch(() => false))) return local
  const r = await $.process.run(['sh', '-c', 'command -v ketch'], { timeoutMs: 5000 }).catch(() => undefined)
  const path = r?.exitCode === 0 ? r.stdout.trim() : ''
  return path || undefined
}

// The ketch query for a WebSearch: the domain lists become site: terms.
export function searchQuery(query: string, allowed?: readonly string[], blocked?: readonly string[]): string {
  const parts = [query]
  if (allowed?.length) parts.push(allowed.length === 1 ? `site:${allowed[0]}` : `(${allowed.map(d => `site:${d}`).join(' OR ')})`)
  for (const d of blocked ?? []) parts.push(`-site:${d}`)
  return parts.join(' ')
}

// True when the same call came within REPEAT_MS. Records this call either way.
function isRepeat(key: string, now: number): boolean {
  for (const [k, t] of recent) if (now - t > REPEAT_MS) recent.delete(k)
  const last = recent.get(key)
  recent.set(key, now)
  return last !== undefined
}

type Ran = { exitCode: number; stdout: string; stderr: string }

async function runKetch($: EngineInterface, argv: string[], timeoutMs: number): Promise<Ran | string> {
  try {
    const r = await $.process.run(argv, { timeoutMs })
    if (r.exitCode !== 0) return `ketch exited with ${r.exitCode}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`
    if (!r.stdout.trim()) return 'ketch printed nothing'
    return r
  } catch (err) {
    return `ketch did not finish: ${String(err).slice(0, 300)}`
  }
}

const OVERRIDE_NOTE = (tool: string) =>
  `${NAME}: ketch answered this ${tool} call in place of the built-in tool, and the answer is complete. ` +
  `Use it. Only when the text is empty, garbled or clearly not the page you asked for, ` +
  `make the same ${tool} call again with the same input within 10 minutes, and the built-in ${tool} runs.`

const FALLBACK_NOTE = (tool: string, why: string) =>
  `${NAME}: the built-in ${tool} ran, because ${why}. Say so to the user if it matters.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: 'Route WebSearch and WebFetch through ketch: on, off, or no argument for the state',
    })
    const env = await $.env.get('KETCH_FIRST').catch(() => undefined)
    if (env === 'off') await update($, isOff, () => true)
    return next(e)
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') await update($, isOff, () => arg === 'off')
    const path = await findKetch($)
    const state = !path ? 'ketch is not installed, so the mod does nothing' : (await read($, isOff)) ? 'off for this session' : `on, using ${path}`
    return { text: `${NAME}: ${state}.` }
  })

  // The ketch commands the hooks do not cover go into the system prompt.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes('Bash') || !(await findKetch($))) return composed
    return {
      sections: [
        ...composed.sections,
        {
          id: `${NAME}:ketch`,
          scope: 'session',
          text: [
            '# Web research with ketch',
            'The `ketch` CLI is installed. WebSearch and WebFetch already run through it.',
            'Through Bash, use ketch in place of `curl` to read a web page:',
            '- `ketch scrape <url> [<url>...]` prints pages as markdown. It also reads text-based PDFs.',
            '- `ketch search "<query>" --scrape` searches and prints the full text of each result.',
            '- `ketch crawl <url>` crawls a site.',
            '- `ketch code "<pattern>" --lang <lang>` searches public source code.',
            '- `ketch docs "<library>"` searches library and framework docs.',
            'Run `ketch <command> -h` for flags, and `ketch doctor` when a backend fails.',
            'For a page that needs a login, use the browser tools or `gh`.',
          ].join('\n'),
        },
      ],
    }
  })

  on('tool.call', { tool: 'WebSearch' }, async ($, e, next) => {
    if (await read($, isOff)) return next(e)
    const ketch = await findKetch($)
    if (!ketch) return next(e)
    // Some builds give WebSearch a mode, standard or extended.
    const mode = (e as { mode?: string }).mode
    const key = JSON.stringify(['WebSearch', e.query, e.allowed_domains ?? [], e.blocked_domains ?? [], mode])
    if (isRepeat(key, Date.now())) return next(e)

    const started = Date.now()
    const query = searchQuery(e.query, e.allowed_domains, e.blocked_domains)
    const limit = mode === 'extended' ? '10' : '8'
    const ran = await runKetch($, [ketch, 'search', query, '--limit', limit], SEARCH_TIMEOUT_MS)
    if (typeof ran === 'string') return withNote(await next(e), FALLBACK_NOTE('WebSearch', ran))

    return {
      result: {
        query: e.query,
        results: [ran.stdout.trim()],
        durationSeconds: (Date.now() - started) / 1000,
      },
      context: [OVERRIDE_NOTE('WebSearch')],
    }
  })

  on('tool.call', { tool: 'WebFetch' }, async ($, e, next) => {
    if (await read($, isOff)) return next(e)
    // claude.ai links are artifacts and sessions that only the built-in tool reads.
    if (!/^https?:\/\//i.test(e.url) || /^https?:\/\/([^/]+\.)?claude\.ai(\/|$)/i.test(e.url)) return next(e)
    const ketch = await findKetch($)
    if (!ketch) return next(e)
    const key = JSON.stringify(['WebFetch', e.url, e.prompt, e.offset ?? 0])
    if (isRepeat(key, Date.now())) return next(e)

    const started = Date.now()
    const ran = await runKetch($, [ketch, 'scrape', e.url], FETCH_TIMEOUT_MS)
    if (typeof ran === 'string') return withNote(await next(e), FALLBACK_NOTE('WebFetch', ran))

    const page = ran.stdout
    const offset = Math.max(0, Math.min(e.offset ?? 0, page.length))
    const end = Math.min(page.length, offset + PAGE_CHARS)
    const text = [
      `ketch scraped ${e.url} as markdown. This is the page text itself, not an answer to your prompt. Read it and answer the prompt yourself: ${e.prompt}`,
      offset > 0 ? `This part starts at character ${offset} of ${page.length}.` : '',
      '',
      page.slice(offset, end),
      end < page.length ? `\n[The page continues. Call WebFetch with offset ${end} to read on. ${page.length} characters in all.]` : '',
    ]
      .filter((line, i) => i !== 1 || line)
      .join('\n')

    return {
      result: {
        bytes: page.length,
        code: 200,
        codeText: 'OK',
        result: text,
        durationMs: Date.now() - started,
        url: e.url,
      },
      context: [OVERRIDE_NOTE('WebFetch')],
    }
  })
}

// Adds a note for the model to a result. A deny stays as it is.
function withNote<T extends { deny?: string; context?: readonly string[] }>(ran: T, note: string): T {
  return ran.deny !== undefined ? ran : { ...ran, context: [...(ran.context ?? []), note] }
}
