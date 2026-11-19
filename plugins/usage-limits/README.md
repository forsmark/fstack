# usage-limits

Reads the 5-hour and the weekly usage window: the percentage used and the
reset time of each. At 90% it tells Claude to write a handoff. It is the port
of two shell scripts, `~/.claude/usage/limits.sh` and
`~/.claude/hooks/handoff-at-90.sh`.

The figure comes from the first source that has one:

1. The engine's reading from the last API response of this session
   (`$.session.usage()`). This costs no request.
2. The file `~/.claude/usage/limits.json`, if its figure is under 5 minutes
   old. Every session with the mod writes that file.
3. The endpoint behind `/usage`. The engine sets the session's credential on
   the request, so the mod never sees the token. The endpoint is undocumented,
   and a Claude Code update may break it.

If all three fail, a figure from the file that is under 15 minutes old still
answers. Otherwise usage is `unknown`. The caller must then treat usage as
unknown, never as low.

The figure goes out three ways:

- Claude calls the tool `mcp__usage-limits__read`. It answers one JSON line:

  ```
  {"five_hour":{"used_percentage":81,"resets_at":1794830400},"seven_day":{"used_percentage":52.5,"resets_at":1795141200},"checked_at":1794824263}
  ```

- The mod writes the same line to `~/.claude/usage/limits.json`. Shell hooks
  and the status line script can read it.
- When a window reaches 90%, Claude gets a hidden note that tells it to stop at
  the next safe point and write a handoff. You see a toast. The note goes once
  per window and period. When no figure exists, Claude is told once per session
  that usage is unknown.

The mod checks after each main-thread turn, when a window moves a whole point,
and at each prompt. The check at a prompt does not delay the prompt.

Cases it handles:

- No reading before the first API response of a session: sources 2 and 3
  answer at the first prompt.
- A session that sat idle: a reading older than 5 minutes is checked against
  the other sources, and one older than 15 minutes is dropped.
- A window whose reset time passed: the figure describes a period that ended,
  so the mod drops it.
- Two sources that disagree: for the same period the higher figure wins,
  because usage only rises inside a period. A later reset time wins over an
  older period.
- Reset times that differ by a second between API responses: times within 2
  minutes count as the same period, so the handoff note is not sent twice.
- A cache file that is malformed, half-written or dated in the future: ignored.
- The endpoint fails, times out after 8 seconds, or the session has no
  subscription login: no figure from it, and no second request for 60 seconds.

Tune `THRESHOLD` and the time limits at the top of
`plugins/usage-limits/hooks/register.ts`. Run the tests with
`claude plugin test usage-limits`.
