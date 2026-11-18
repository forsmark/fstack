import type { EngineInterface, Register, Timer } from 'claude-code'

// The 1-hour prompt cache lapses an hour after its last read. Ping it a few
// minutes short of that, while the session sits idle, with a fork of the
// session's own last request: same prefix, so a cache read that resets the TTL,
// and nothing is added to the transcript.
const IDLE_MS = 55 * 60 * 1000
const MAX_PINGS = 8
const PING_PROMPT = 'Keep-alive ping. Reply with the single word: ok'

// Module state; a hot reload starts it over and drops the pending timer.
let timer: Timer | undefined
let pings = 0

function disarm() {
  timer?.cancel()
  timer = undefined
}

function arm($: EngineInterface) {
  disarm()
  timer = $.clock.after(IDLE_MS, () => void ping($))
}

function stop($: EngineInterface, why: string) {
  disarm()
  $.ui.status(`cache-warmer: ${why}`)
}

async function ping($: EngineInterface) {
  timer = undefined
  const r = await $.model.fork({ prompt: PING_PROMPT })
  if (!r.isAnswered) return stop($, `stopped (${r.reason})`)

  pings++
  const read = r.usage.cache_read_input_tokens
  // No cache read means the entry had already lapsed (or the TTL is 5 min):
  // further pings would only pay to rebuild it.
  if (read === 0) return stop($, 'cache had lapsed, stopped')

  const kTokens = Math.round(read / 1000)
  if (pings >= MAX_PINGS) return stop($, `kept warm ${pings}x (${kTokens}k), limit reached`)

  $.ui.status(`cache-warmer: kept warm ${pings}/${MAX_PINGS} (${kTokens}k)`)
  arm($)
}

export const register: Register = on => {
  // Main loop only: a subagent's turn ending says nothing about the session being idle.
  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      pings = 0
      arm($)
    }
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    disarm()
    if (pings > 0) $.ui.status(undefined)
    pings = 0
    return next(e)
  })
}
