import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Told } from '../types'

// The port of ~/.claude/usage/limits.sh and ~/.claude/hooks/handoff-at-90.sh.
//
// Figures come from three sources, in this order:
//   1. the engine's reading from the last API response of this session
//   2. the file ~/.claude/usage/limits.json, which every session writes
//   3. the endpoint behind /usage, asked with the session's own credential.
//      It is undocumented, so a Claude Code update may break it. A break
//      shows as "unknown", never as a low figure.
//
// Figures go out three ways, in the script's JSON shape:
//   - the tool mcp__usage-limits__read, for Claude
//   - the file ~/.claude/usage/limits.json, for shell hooks and the script
//   - a notice to Claude when a window reaches THRESHOLD, unless it resets
//     within RESET_SOON_S, or when no figure exists
const TOOL = 'mcp__usage-limits__read'
const THRESHOLD = 90
const RESET_SOON_S = 15 * 60 // A window that resets this soon gets no handoff notice.
const FRESH_S = 300 // A figure this young needs no second source.
const MAX_AGE_S = 900 // Older than this, a figure says nothing about now.
const SAME_RESET_S = 120 // Reset times this close name the same period.
const FETCH_GAP_S = 60 // The shortest time between two requests to the endpoint.
const FETCH_TIMEOUT_MS = 8000
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

const UNKNOWN =
  'unknown: no usage figure less than 15 minutes old exists. Treat usage as unknown, never as low.'
const UNKNOWN_NOTICE =
  'The usage limits cannot be read: no figure less than 15 minutes old exists. Treat usage as unknown, not as low. Ask the user before starting a subagent.'
const handoffNotice = (name: string, percent: number) =>
  `The ${name} usage window is at ${percent}%. Stop at the next safe point and write a handoff now with the mattpocock-skills:handoff skill (its SKILL.md is under ~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/*/skills/productivity/handoff/). Then tell the user it is written and where.`

const WINDOWS = ['five_hour', 'seven_day'] as const
type WindowKind = (typeof WINDOWS)[number]
const NAMES: Record<WindowKind, string> = { five_hour: '5-hour', seven_day: 'weekly' }

export type Window = { used_percentage: number; resets_at?: number }
export type Limits = { five_hour?: Window; seven_day?: Window; checked_at: number }

const told = atom({ plugin: 'usage-limits', key: 'told' } as const, { isUnknownTold: false } as Told, {
  shape: 'told-1',
})

// Module state. A reload starts it over, which only costs one extra request.
let lastLiveS = 0 // When the engine last gave a reading that followed an API response.
let lastFetchS = 0
let queue: Promise<unknown> = Promise.resolve()

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// A window whose reset time passed describes a period that ended: drop it.
function liveWindow(w: Window | undefined, nowS: number): Window | undefined {
  if (!w || !isNumber(w.used_percentage) || w.used_percentage < 0) return undefined
  if (w.resets_at === undefined) return { used_percentage: w.used_percentage }
  if (!isNumber(w.resets_at) || w.resets_at <= nowS) return undefined
  return { used_percentage: w.used_percentage, resets_at: Math.floor(w.resets_at) }
}

function build(five: Window | undefined, seven: Window | undefined, checkedS: number, nowS: number) {
  const five_hour = liveWindow(five, nowS)
  const seven_day = liveWindow(seven, nowS)
  if (!five_hour && !seven_day) return undefined
  const limits: Limits = { checked_at: Math.floor(checkedS) }
  if (five_hour) limits.five_hour = five_hour
  if (seven_day) limits.seven_day = seven_day
  return limits
}

function parseReset(v: unknown): number | undefined {
  if (isNumber(v)) return v
  const ms = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

// The engine's reading. Undefined before the first API response of the
// session, off a subscription, or when both periods already ended.
export function fromEngine(limits: readonly SessionRateLimit[], nowS: number): Limits | undefined {
  const one = (kind: WindowKind): Window | undefined => {
    const found = limits.find(l => l.kind === kind)
    if (!found) return undefined
    const resets_at = parseReset(found.resetsAt)
    return { used_percentage: found.percentUsed, ...(resets_at === undefined ? {} : { resets_at }) }
  }
  return build(one('five_hour'), one('seven_day'), nowS, nowS)
}

// The cache file, in the script's shape. Anything malformed, from the future
// or older than maxAgeS is no figure.
export function fromCache(text: string, nowS: number, maxAgeS: number): Limits | undefined {
  try {
    const raw = JSON.parse(text) as Partial<Limits> | null
    if (!raw || !isNumber(raw.checked_at)) return undefined
    const age = nowS - raw.checked_at
    if (age < -60 || age >= maxAgeS) return undefined
    return build(raw.five_hour, raw.seven_day, raw.checked_at, nowS)
  } catch {
    return undefined
  }
}

// The endpoint's answer: {five_hour: {utilization, resets_at: ISO | null}, seven_day: ...}.
export function fromEndpoint(text: string, nowS: number): Limits | undefined {
  try {
    const raw = JSON.parse(text) as Record<string, { utilization?: unknown; resets_at?: unknown } | null> | null
    const one = (kind: WindowKind): Window | undefined => {
      const w = raw?.[kind]
      if (!w || !isNumber(w.utilization)) return undefined
      const resets_at = parseReset(w.resets_at)
      return { used_percentage: w.utilization, ...(resets_at === undefined ? {} : { resets_at }) }
    }
    return build(one('five_hour'), one('seven_day'), nowS, nowS)
  } catch {
    return undefined
  }
}

// Usage only rises inside one period. So for the same period the higher figure
// is the newer one, and a later reset time names a newer period.
function mergeWindow(a: Window | undefined, b: Window | undefined): Window | undefined {
  if (!a || !b) return a ?? b
  if (a.resets_at === undefined || b.resets_at === undefined) {
    if (a.resets_at === b.resets_at) return a.used_percentage >= b.used_percentage ? a : b
    return a.resets_at === undefined ? b : a
  }
  if (Math.abs(a.resets_at - b.resets_at) <= SAME_RESET_S) return a.used_percentage >= b.used_percentage ? a : b
  return a.resets_at > b.resets_at ? a : b
}

export function merge(a: Limits | undefined, b: Limits | undefined, nowS: number): Limits | undefined {
  if (!a || !b) return a ?? b
  return build(
    mergeWindow(a.five_hour, b.five_hour),
    mergeWindow(a.seven_day, b.seven_day),
    Math.max(a.checked_at, b.checked_at),
    nowS,
  )
}

async function cachePath($: EngineInterface) {
  const home = await $.env.get('HOME')
  return home ? `${home}/.claude/usage/limits.json` : undefined
}

// A shell reader must never see half a file: write beside it, then rename.
async function writeCache($: EngineInterface, limits: Limits) {
  try {
    const path = await cachePath($)
    if (!path) return
    await $.fs.write(`${path}.mod.tmp`, `${JSON.stringify(limits)}\n`)
    await $.process.run(['mv', `${path}.mod.tmp`, path], { timeoutMs: 5000 })
  } catch {
    // The file is a convenience for other readers. The figure itself stands.
  }
}

async function readCache($: EngineInterface, nowS: number, maxAgeS: number) {
  try {
    const path = await cachePath($)
    return path ? fromCache(await $.fs.read(path), nowS, maxAgeS) : undefined
  } catch {
    return undefined
  }
}

// One request, with the credential set by the engine: the mod never sees it.
async function fetchLimits($: EngineInterface, nowS: number) {
  if (nowS - lastFetchS < FETCH_GAP_S) return undefined
  lastFetchS = nowS
  try {
    const auth = await $.session.authorize()
    if (auth?.kind !== 'bearer') return undefined
    const response = await Promise.race([
      $.http.fetch(USAGE_URL, { auth: auth.handle, headers: { 'anthropic-beta': 'oauth-2025-04-20' } }),
      $.clock.sleep(FETCH_TIMEOUT_MS).then(() => undefined),
    ])
    return response?.ok ? fromEndpoint(response.text, nowS) : undefined
  } catch {
    return undefined
  }
}

// The best figure available now, or undefined when usage is unknown.
// `isAfterResponse`: the engine's reading follows an API response of this
// moment (a measurement, a tool call), so it is as new as a figure can be.
async function current(
  $: EngineInterface,
  rateLimits: readonly SessionRateLimit[],
  isAfterResponse: boolean,
): Promise<Limits | undefined> {
  const nowS = (await $.clock.now()) / 1000
  let live = fromEngine(rateLimits, nowS)
  if (live && isAfterResponse) lastLiveS = nowS
  // In a session that sat idle the reading may be hours old. Its age is the
  // time since the last response, and past MAX_AGE_S it is no figure at all.
  const liveAge = nowS - lastLiveS
  if (live && liveAge >= MAX_AGE_S) live = undefined
  if (live) live.checked_at = Math.floor(lastLiveS)

  const isLiveEnough = live?.five_hour && live.seven_day && liveAge < FRESH_S
  if (live && isLiveEnough) {
    await writeCache($, live)
    return live
  }

  // The reading is absent, partial or not young: ask the other sources.
  const cached = await readCache($, nowS, FRESH_S)
  let best = merge(live, cached, nowS)
  let isNewer = live !== undefined
  if (!cached?.five_hour || !cached.seven_day) {
    const fetched = await fetchLimits($, nowS)
    if (fetched) {
      best = merge(best, fetched, nowS)
      isNewer = true
    }
  }
  best ??= await readCache($, nowS, MAX_AGE_S)
  if (best && isNewer) await writeCache($, best)
  return best
}

async function tell($: EngineInterface, text: string, toast: string) {
  const appended = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
  if (appended.deny !== undefined) return false
  $.ui.toast(toast)
  return true
}

// Sends each notice once: "unknown" once per session, the handoff once per
// window and period. A window that fell back under the threshold arms again.
// A window that resets within RESET_SOON_S gets no handoff. Claude continues,
// and the reset frees the window. Each check looks at the window again.
async function notify($: EngineInterface, limits: Limits | undefined) {
  const state = await read($, told)
  const nowS = (await $.clock.now()) / 1000
  if (!limits) {
    if (state.isUnknownTold) return
    if (await tell($, UNKNOWN_NOTICE, 'usage-limits: usage unknown, no figure exists')) {
      await update($, told, t => ({ ...t, isUnknownTold: true }))
    }
    return
  }
  for (const kind of WINDOWS) {
    const w = limits[kind]
    if (!w) continue
    const toldFor = state[kind]
    if (Math.round(w.used_percentage) < THRESHOLD) {
      if (toldFor !== undefined) await update($, told, t => ({ ...t, [kind]: undefined }))
      continue
    }
    const period = w.resets_at ?? 0
    const isSamePeriod = toldFor !== undefined && (period === 0 || toldFor === 0 || Math.abs(toldFor - period) <= SAME_RESET_S)
    if (isSamePeriod) continue
    // Count from now: the figure's checked_at can be 15 minutes old.
    if (w.resets_at !== undefined && w.resets_at - nowS <= RESET_SOON_S) continue
    const percent = Math.round(w.used_percentage)
    const name = NAMES[kind]
    if (await tell($, handoffNotice(name, percent), `usage-limits: ${name} usage at ${percent}%, asking Claude for a handoff`)) {
      await update($, told, t => ({ ...t, [kind]: period }))
    }
    return // One notice at a time, as one handoff covers both windows.
  }
}

// One check at a time, so two events never send the same notice twice.
function check($: EngineInterface, rateLimits: readonly SessionRateLimit[] | undefined, isAfterResponse: boolean) {
  const run = async () => {
    const limits = await current($, rateLimits ?? (await $.session.usage()).rateLimits, isAfterResponse)
    await notify($, limits)
  }
  queue = queue.then(run, run).catch(() => undefined)
  return queue
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'read',
      description:
        'Reads the account usage limits: the percentage used of the 5-hour and the weekly (seven_day) window, and when each resets (resets_at, unix seconds). Answers one JSON line, or "unknown" when no recent figure exists.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    return started
  })

  // Fires after each main-thread turn and when a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    await check($, e.rateLimits, true)
    return next(e)
  })

  // Covers what a measurement cannot: the first prompt of a session, before any
  // API response, and a prompt after a long idle time. Never delays the prompt.
  on('prompt.submit', ($, e, next) => {
    void check($, undefined, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async $ => {
    const limits = await current($, (await $.session.usage()).rateLimits, true)
    return { result: limits ? JSON.stringify(limits) : UNKNOWN }
  }).catch(() => ({ result: UNKNOWN }))
}
