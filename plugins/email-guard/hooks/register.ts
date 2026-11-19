import type { EngineInterface, Register } from 'claude-code'

// The addresses that must never travel in a request header come from two
// places outside the repo: the file below, one address per line, and the
// global git user.email. Both are compared lowercased.
const EMAILS_FILE = '.config/email-guard/emails'

// A key, flag or word that names a header: User-Agent, From, Referer, Cookie,
// Authorization, any X- header, or "header(s)" itself.
const HEADER_WORD = /user[-_ ]?agent|\bheaders?\b|\breferr?er\b|\bcookie\b|\bauthorization\b|^from$|\bx-[a-z0-9-]+\s*[:=]/i

// A value that is itself a header line, such as "From: name@example.com".
// The space after the colon keeps search syntax like "from:me" out.
const HEADER_LINE = /^\s*(from|user-agent|referr?er|cookie|authorization|x-[a-z0-9-]+)\s*:\s/im

// Command-line flags whose next argument is a header value (curl, wget, httpie, xh, ketch).
const HEADER_FLAG = /^(-H|-A|-e|-U|-b|--header|--headers|--user-agent|--referer|--cookie)$/
const HEADER_FLAG_JOINED = /^(-H|-A|-e|-U|-b)\S|^--(header|headers|user-agent|referer|cookie)=/

// httpie and xh take a header as `Name:value` (`Name:=value` is a JSON field).
const HEADER_ITEM = /^[A-Za-z][A-Za-z0-9-]*:(?!=)/

// Lines of the file, with `#` comments and blank lines dropped.
export function parseEmails(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/#.*/, '').trim().toLowerCase())
    .filter(line => line.includes('@'))
}

async function loadEmails($: EngineInterface): Promise<string[]> {
  const emails = new Set<string>()
  const home = await $.env.get('HOME').catch(() => undefined)
  if (home) {
    const text = await $.fs.read(`${home}/${EMAILS_FILE}`).catch(() => '')
    if (typeof text === 'string') for (const e of parseEmails(text)) emails.add(e)
  }
  const git = await $.process.run(['git', 'config', '--global', 'user.email'], { timeoutMs: 5000 }).catch(() => undefined)
  if (git && git.exitCode === 0) for (const e of parseEmails(git.stdout)) emails.add(e)
  return [...emails]
}

export function hasEmail(text: string, emails: readonly string[]): boolean {
  const t = text.toLowerCase().replace(/%40/g, '@')
  return emails.some(addr => t.includes(addr))
}

// Splits a shell command into words, honouring quotes and backslashes, and
// breaking at ; | & and newlines. Good enough to find flag/value pairs.
export function shellWords(command: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  let quote: '"' | "'" | undefined
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word += c
    } else if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '\\' && i + 1 < command.length) word += command[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      inWord = true
    } else if (c === '\\' && i + 1 < command.length) {
      word += command[++i]
      inWord = true
    } else if (/[\s;|&]/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }
  if (inWord) words.push(word)
  return words
}

// A shell command leaks when a word holding the address is a header value:
// after a header flag, joined to one, a `Name:value` item, or a word (or the
// word before it) that names a header, as in a script's headers={...}.
export function commandLeaks(command: string, emails: readonly string[]): boolean {
  if (!hasEmail(command, emails)) return false
  const words = shellWords(command)
  return words.some((w, i) => {
    if (!hasEmail(w, emails)) return false
    const prev = words[i - 1] ?? ''
    return (
      HEADER_FLAG.test(prev) ||
      HEADER_WORD.test(prev) ||
      HEADER_FLAG_JOINED.test(w) ||
      HEADER_ITEM.test(w) ||
      HEADER_LINE.test(w) ||
      HEADER_WORD.test(w)
    )
  })
}

// Any other tool (MCP request tools and the like) leaks when a string holding
// the address sits under a header-named key, or is itself a header line.
export function inputLeaks(value: unknown, emails: readonly string[], path: string[] = []): boolean {
  if (typeof value === 'string') {
    if (!hasEmail(value, emails)) return false
    return path.some(k => HEADER_WORD.test(k)) || HEADER_LINE.test(value)
  }
  if (Array.isArray(value)) return value.some(v => inputLeaks(v, emails, path))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => inputLeaks(v, emails, [...path, k]))
  }
  return false
}

const RESERVED = new Set(['tool', 'tool_use_id', 'consent', 'agentId', 'requestMeta'])

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const args = Object.fromEntries(Object.entries(e).filter(([k]) => !RESERVED.has(k)))
    // Most calls hold no address at all. Only the others read the address list.
    if (!/@|%40/i.test(JSON.stringify(args))) return next(e)
    const emails = await loadEmails($)
    const command = (e.tool === 'Bash' || e.tool === 'PowerShell') && typeof args.command === 'string' ? args.command : undefined
    const leaks = command !== undefined ? commandLeaks(command, emails) : inputLeaks(args, emails)
    if (!leaks) return next(e)

    $.ui.toast(`email-guard: blocked ${e.tool}: personal email in a request header`)
    return {
      deny:
        `${$.plugin.name}: this ${e.tool} call puts the user's personal email address in a request header ` +
        `(User-Agent, From, Referer, a cookie or another header). That is not allowed. ` +
        `Run the call again without the address. Where a service asks for contact details, ` +
        `use a generic User-Agent with no email, and ask the user before sending any contact address.`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed, so the call was blocked.` },
  )
}
