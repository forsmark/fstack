import { expect, test } from 'claude-code/testing'

type On = Parameters<Parameters<typeof test>[1]>[1]
type Run = { exitCode: number; stdout: string; stderr?: string }

const KETCH = '/home/test/.local/bin/ketch'
const BUILT_IN = { query: 'built-in', results: ['from the built-in tool'], durationSeconds: 1 }

// Stubs the engine: HOME, whether ketch exists, what ketch prints, and the built-in tool.
function engine(on: On, ketch: Run | undefined) {
  const argvs: string[][] = []
  on('env.get', (_$, { name }) => ({ value: name === 'HOME' ? '/home/test' : undefined }))
  on('fs.exists', (_$, { path }) => ({ value: ketch !== undefined && path === KETCH }))
  on('process.run', (_$, { argv }) => {
    if (argv[0] === 'sh') return { value: { exitCode: 1, stdout: '', stderr: '' } }
    argvs.push([...argv])
    return { value: { stderr: '', ...ketch! } }
  })
  on('tool.call', (_$, { tool }) => ({ result: tool === 'WebSearch' ? BUILT_IN : { bytes: 1, code: 200, codeText: 'OK', result: 'built-in page', durationMs: 1, url: 'x' } }))
  return argvs
}

test('without ketch, the built-in WebSearch runs', async ($, on) => {
  const argvs = engine(on, undefined)
  const r = await $.tool.call({ tool: 'WebSearch', query: 'q1' } as never)
  expect(r.result).toEqual(BUILT_IN)
  expect(argvs).toEqual([])
})

test('with ketch, WebSearch answers with ketch output and maps the domains', async ($, on) => {
  const argvs = engine(on, { exitCode: 0, stdout: 'ketch results\n' })
  const r = await $.tool.call({ tool: 'WebSearch', query: 'q2', allowed_domains: ['a.com', 'b.org'], blocked_domains: ['c.net'] } as never)
  expect((r.result as { results: string[] }).results).toEqual(['ketch results'])
  expect(argvs[0]).toEqual([KETCH, 'search', 'q2 (site:a.com OR site:b.org) -site:c.net', '--limit', '8'])
})

test('when ketch fails, the built-in WebSearch runs with a note', async ($, on) => {
  engine(on, { exitCode: 4, stdout: '', stderr: 'Error: search failed' })
  const r = await $.tool.call({ tool: 'WebSearch', query: 'q3' } as never)
  expect(r.result).toEqual(BUILT_IN)
  expect(r.context?.join('\n')).toContain('ketch exited with 4')
})

test('the same call again runs the built-in tool', async ($, on) => {
  const argvs = engine(on, { exitCode: 0, stdout: 'ketch results' })
  const first = await $.tool.call({ tool: 'WebSearch', query: 'q4' } as never)
  const second = await $.tool.call({ tool: 'WebSearch', query: 'q4' } as never)
  expect((first.result as { results: string[] }).results).toEqual(['ketch results'])
  expect(second.result).toEqual(BUILT_IN)
  expect(argvs.length).toBe(1)
})

test('WebFetch returns the scraped page from the offset, with the prompt', async ($, on) => {
  const page = 'x'.repeat(50_000)
  const argvs = engine(on, { exitCode: 0, stdout: page })
  const r = await $.tool.call({ tool: 'WebFetch', url: 'https://example.com/a', prompt: 'find the flags' } as never)
  const text = (r.result as { result: string }).result
  expect(argvs[0]).toEqual([KETCH, 'scrape', 'https://example.com/a'])
  expect(text).toContain('find the flags')
  expect(text).toContain('offset 40000')
  const more = await $.tool.call({ tool: 'WebFetch', url: 'https://example.com/a', prompt: 'find the flags', offset: 40_000 } as never)
  expect((more.result as { result: string }).result).not.toContain('The page continues')
})

test('WebFetch of a claude.ai link runs the built-in tool', async ($, on) => {
  const argvs = engine(on, { exitCode: 0, stdout: 'page' })
  const r = await $.tool.call({ tool: 'WebFetch', url: 'https://claude.ai/artifact/abc', prompt: 'p' } as never)
  expect((r.result as { result: string }).result).toBe('built-in page')
  expect(argvs).toEqual([])
})
