import { expect, test } from 'claude-code/testing'

const NOW_MS = 1794824263000
const NOW_S = NOW_MS / 1000
const TOOL = 'mcp__usage-limits__read'
const CACHE = '/home/u/.claude/usage/limits.json'

const limit = (kind: string, percentUsed: number, resetsAt?: string) => ({ kind, percentUsed, resetsAt })
const FIVE = '2026-11-16T12:00:00.000Z' // 1794830400
const SEVEN = '2026-11-20T02:20:00+00:00' // 1795141200
const RATE_LIMITS = [limit('five_hour', 81, FIVE), limit('seven_day', 52.5, SEVEN), limit('spend_limit', 3)]
const EXPECTED = {
  five_hour: { used_percentage: 81, resets_at: 1794830400 },
  seven_day: { used_percentage: 52.5, resets_at: 1795141200 },
  checked_at: NOW_S,
}
const ENDPOINT = JSON.stringify({
  five_hour: { utilization: 95, resets_at: '2026-11-16T12:00:00.123456+00:00' },
  seven_day: { utilization: 40, resets_at: null },
})

type Engine = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]
type World = {
  rateLimits?: unknown[]
  cached?: string
  endpoint?: { ok: boolean; text: string } | 'throws'
  auth?: { handle: string; kind: string } | null
  home?: string | undefined
  nowMs?: number
  isRefused?: boolean
}

// Stands for the engine beneath the mod. Returns what the mod did.
function engine(on: Engine, world: World = {}) {
  const seen = {
    writes: {} as Record<string, string>,
    moves: [] as string[][],
    fetches: [] as { url: string; auth?: string }[],
    notes: [] as string[],
    toasts: [] as string[],
    world,
  }
  on('clock.now', () => ({ value: world.nowMs ?? NOW_MS }))
  on('clock.sleep', () => new Promise<never>(() => undefined))
  on('env.get', () => ({ value: 'home' in world ? world.home : '/home/u' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: world.rateLimits ?? [] } }) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('fs.write', (_, e) => {
    seen.writes[e.path] = e.text
    return { value: undefined }
  })
  on('fs.read', () => {
    if (world.cached === undefined) throw new Error('ENOENT')
    return { value: world.cached } as never
  })
  on('process.run', (_, e) => {
    seen.moves.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.authorize', () => ({ value: 'auth' in world ? world.auth : { handle: 'h1', kind: 'bearer' } }) as never)
  on('http.fetch', (_, e) => {
    seen.fetches.push({ url: e.url, auth: e.init?.auth })
    if (world.endpoint === 'throws' || world.endpoint === undefined) throw new Error('network')
    return { value: { status: world.endpoint.ok ? 200 : 500, headers: {}, ...world.endpoint } } as never
  })
  on('session.append', (_, e, next) => {
    if (world.isRefused) return { deny: 'refused' } as never
    seen.notes.push((e.message.content[0] as unknown as { text: string }).text)
    return next(e)
  })
  on('ui.toast', (_, e) => {
    seen.toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  return seen
}

const cache = (over: object, ageS: number) => JSON.stringify({ ...EXPECTED, ...over, checked_at: NOW_S - ageS })
const read = async ($: { tool: { call: (i: never) => Promise<{ result?: unknown }> } }) =>
  (await $.tool.call({ tool: TOOL } as never)).result as string
const measure = ($: { session: { measure: (i: never) => Promise<unknown> } }, rateLimits: unknown[]) =>
  $.session.measure({ context: {}, rateLimits, changed: ['rateLimits'] } as never)
// The prompt hook starts its check and does not wait for it.
const timers = globalThis as unknown as { setTimeout: (run: () => void, ms: number) => void }
const settle = () => new Promise<void>(r => timers.setTimeout(r, 50))

test('the tool answers the live figures in the script shape and caches them', async ($, on) => {
  const seen = engine(on, { rateLimits: RATE_LIMITS })
  expect(JSON.parse(await read($))).toEqual(EXPECTED)
  expect(JSON.parse(seen.writes[`${CACHE}.mod.tmp`]!)).toEqual(EXPECTED)
  expect(seen.moves).toEqual([['mv', `${CACHE}.mod.tmp`, CACHE]])
  expect(seen.fetches).toEqual([])
})

test('with no live reading, a young cached figure answers without a request', async ($, on) => {
  const seen = engine(on, { cached: cache({}, 200) })
  expect(JSON.parse(await read($)).checked_at).toBe(NOW_S - 200)
  expect(seen.fetches).toEqual([])
  expect(Object.keys(seen.writes)).toEqual([])
})

test('with no live reading and no young cache, the endpoint answers', async ($, on) => {
  const seen = engine(on, { cached: cache({}, 600), endpoint: { ok: true, text: ENDPOINT } })
  expect(JSON.parse(await read($))).toEqual({
    five_hour: { used_percentage: 95, resets_at: 1794830400 },
    seven_day: { used_percentage: 40 },
    checked_at: NOW_S,
  })
  expect(seen.fetches).toEqual([{ url: 'https://api.anthropic.com/api/oauth/usage', auth: 'h1' }])
  expect(seen.writes[`${CACHE}.mod.tmp`]).toContain('"used_percentage":95')
})

test('when the endpoint fails, a cached figure under 15 minutes old answers', async ($, on) => {
  engine(on, { cached: cache({}, 600), endpoint: { ok: false, text: 'no' } })
  expect(JSON.parse(await read($)).checked_at).toBe(NOW_S - 600)
})

test('usage is unknown with no source', async ($, on) => {
  const world: World = {}
  engine(on, world)
  const worlds: World[] = [
    {},
    { cached: cache({}, 901) },
    { cached: cache({}, -3600) },
    { cached: '{"five_hour":' },
    { cached: 'null' },
    { cached: cache({ five_hour: { used_percentage: 'high' }, seven_day: null }, 10) },
    { auth: null },
    { auth: { handle: 'k', kind: 'api-key' }, endpoint: { ok: true, text: ENDPOINT } },
    { endpoint: { ok: true, text: '<html>' } },
    { endpoint: { ok: true, text: '{"five_hour":{"utilization":null}}' } },
    { home: undefined },
  ]
  for (const [i, one] of worlds.entries()) {
    for (const key of Object.keys(world)) delete world[key as keyof World]
    // Two minutes apart, so each world is past the gap between requests.
    Object.assign(world, one, { nowMs: NOW_MS + i * 120_000 })
    expect(await read($), JSON.stringify(one)).toContain('unknown')
  }
})

test('a failed request is not sent again within a minute', async ($, on) => {
  const seen = engine(on, { endpoint: 'throws' })
  await read($)
  await read($)
  expect(seen.fetches.length).toBe(1)
  seen.world.nowMs = NOW_MS + 61_000
  await read($)
  expect(seen.fetches.length).toBe(2)
})

test('a window whose reset time passed is dropped', async ($, on) => {
  engine(on, { rateLimits: [limit('five_hour', 99, '2026-11-16T09:00:00Z'), limit('seven_day', 52.5, SEVEN)] })
  const r = JSON.parse(await read($))
  expect(r.five_hour).toBeUndefined()
  expect(r.seven_day.used_percentage).toBe(52.5)
})

test('for the same period the higher figure of two sources wins', async ($, on) => {
  // The live reading lacks the weekly window, so the cache is read too.
  engine(on, {
    rateLimits: [limit('five_hour', 60, FIVE)],
    cached: cache({ five_hour: { used_percentage: 72, resets_at: 1794830401 } }, 100),
  })
  const r = JSON.parse(await read($))
  expect(r.five_hour.used_percentage).toBe(72)
  expect(r.seven_day.used_percentage).toBe(52.5)
})

test('a later reset time wins over a higher figure of an older period', async ($, on) => {
  engine(on, {
    rateLimits: [limit('five_hour', 4, '2026-11-16T17:00:00Z')],
    cached: cache({ five_hour: { used_percentage: 97, resets_at: 1794830400 } }, 100),
  })
  expect(JSON.parse(await read($)).five_hour).toEqual({ used_percentage: 4, resets_at: 1794848400 })
})

test('a measurement refreshes the cache file and sends no notice under 90%', async ($, on) => {
  const seen = engine(on)
  await measure($, RATE_LIMITS)
  expect(JSON.parse(seen.writes[`${CACHE}.mod.tmp`]!)).toEqual(EXPECTED)
  expect(seen.notes).toEqual([])
})

test('at 90% Claude is told once per window and period', async ($, on) => {
  const seen = engine(on)
  const at = (five: number, reset = FIVE) => [limit('five_hour', five, reset), limit('seven_day', 52.5, SEVEN)]
  await measure($, at(89.6))
  expect(seen.notes.length).toBe(1)
  expect(seen.notes[0]).toContain('The 5-hour usage window is at 90%')
  expect(seen.notes[0]).toContain('handoff')
  expect(seen.toasts.length).toBe(1)
  // The same period again, its reset time one second off, as the API reports it.
  await measure($, at(93, '2026-11-16T11:59:59Z'))
  expect(seen.notes.length).toBe(1)
  // The next period, under the threshold, then over it.
  await measure($, at(3, '2026-11-16T17:00:00Z'))
  await measure($, at(91, '2026-11-16T17:00:00Z'))
  expect(seen.notes.length).toBe(2)
  // The weekly window has its own notice.
  await measure($, [limit('five_hour', 91, '2026-11-16T17:00:00Z'), limit('seven_day', 90, SEVEN)])
  expect(seen.notes.length).toBe(3)
  expect(seen.notes[2]).toContain('The weekly usage window is at 90%')
})

test('the first prompt of a session checks before any API response', async ($, on) => {
  const seen = engine(on, { endpoint: { ok: true, text: ENDPOINT } })
  await $.prompt.submit({ text: 'hello' } as never)
  await settle()
  expect(seen.fetches.length).toBe(1)
  expect(seen.notes.length).toBe(1)
  expect(seen.notes[0]).toContain('The 5-hour usage window is at 95%')
})

test('unknown usage is told once per session', async ($, on) => {
  const seen = engine(on)
  await measure($, [])
  await measure($, [])
  expect(seen.notes.length).toBe(1)
  expect(seen.notes[0]).toContain('Treat usage as unknown, not as low')
})

test('a refused notice is sent again at the next check', async ($, on) => {
  const seen = engine(on, { isRefused: true })
  const high = [limit('five_hour', 95, FIVE), limit('seven_day', 10, SEVEN)]
  await measure($, high)
  seen.world.isRefused = false
  await measure($, high)
  expect(seen.toasts.length).toBe(1)
})
