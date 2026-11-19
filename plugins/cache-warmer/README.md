# cache-warmer

Keeps an idle session's 1-hour prompt cache warm. When the main loop finishes a
turn, a 55-minute timer starts. If you haven't sent anything when it fires, the
mod runs `$.model.fork`: the session's own last request is sent again with a
one-line "reply ok" prompt after it. Because the prefix is identical, the API
serves it from cache, which resets the cache TTL. Nothing is added to the
transcript and your prompt box is never touched.

- Sending a prompt cancels the timer.
- At most 8 pings in a row (about 7.3 hours idle), then it stops.
- If a ping reads nothing from cache (the entry had already lapsed, or the
  session uses the 5-minute TTL), it stops instead of paying to rebuild.
- The status line shows `cache-warmer: kept warm n/8 (<k> cached tokens)`.

Each ping costs a cache read of the whole context (about 10% of base input
price) plus a few output tokens, and counts against plan usage.

Tune `IDLE_MS` and `MAX_PINGS` at the top of `plugins/cache-warmer/hooks/register.ts`.
