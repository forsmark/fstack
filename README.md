# claude-mods

Personal Claude Code mods (function-hook plugins). This repository is also a
plugin marketplace.

## cache-warmer

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

Tune `IDLE_MS` and `MAX_PINGS` at the top of `cache-warmer/hooks/register.ts`.

## email-guard

Blocks any tool call that would put a personal email address into an outgoing
request header. Claude gets an error that tells it to retry without the
address, and you see a toast.

It checks two kinds of tool call:

- Shell commands (Bash, PowerShell): a word holding the address that is a
  header value. That is the word after `-H`, `--header`, `-A`,
  `--user-agent`, `-e`, `--referer`, `-U` or `-b`, or the same flag joined to
  it. It is also a `Name:value` item (httpie, xh), a `From: ...` header line,
  or a word that names a header itself, such as a script's
  `headers={'User-Agent': ...}` or `ketch config set user_agent ...`.
- Every other tool, MCP tools included: a string holding the address under a
  key that names a header, or a string that is a header line.

The match ignores case and also finds `%40` for `@`. Using the address
elsewhere, for example `git config user.email` or a Gmail search, is not
blocked.

What it cannot see: a header set through a shell variable
(`UA="..."; curl -A "$UA"`), or one written into a script file that a later
command runs.

Edit the address list in `EMAILS` at the top of `email-guard/hooks/register.ts`.
Run the tests with `claude plugin test email-guard`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cache-warmer --marketplace forsmark/claude-mods
```

From a shell:

```
claude plugin install cache-warmer --marketplace forsmark/claude-mods
```

This is a private repository: installing needs read access on GitHub and a git
credential for github.com on the machine (an SSH key, or `gh auth login` then
`gh auth setup-git`).

To run it from a local checkout instead, so edits apply on `/reload-plugins`:

```
claude plugin marketplace add ~/development/claude-mods
claude plugin install cache-warmer@claude-mods
```
