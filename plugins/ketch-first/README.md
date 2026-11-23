# ketch-first

Answers WebSearch and WebFetch calls with the [ketch](https://ketch.run/) CLI
when ketch is installed. Without ketch the mod does nothing, and the built-in
tools run as usual.

- **WebSearch** runs `ketch search "<query>" --limit 8`, or `--limit 10` for
  an extended search. `allowed_domains` become `site:` terms, and
  `blocked_domains` become `-site:` terms.
- **WebFetch** runs `ketch scrape <url>` and returns up to 40,000 characters
  of the page as markdown, from `offset` on. The built-in WebFetch applies its
  `prompt` to the page. This mod does not, so Claude reads the page text
  itself. A `claude.ai` link always goes to the built-in tool.

The mod finds ketch at `~/.local/bin/ketch`, or else on the PATH.

## When ketch fails

When ketch exits with an error, prints nothing or runs past its time limit,
the built-in tool runs. Claude gets a note that says why. The time limit is
30 seconds for a search and 60 seconds for a page.

## Overrides

- **Claude:** after a ketch answer, the same call with the same input within
  10 minutes runs the built-in tool. Each ketch answer tells Claude to use it,
  and to repeat the call only when the text is empty, garbled or the wrong
  page.
- **You, for one session:** `/ketch-first off` and `/ketch-first on`.
  `/ketch-first` alone shows the state.
- **You, from the start:** set `KETCH_FIRST=off` in the environment.

## The system prompt

When ketch and the Bash tool are both there, the mod adds a short section to
the system prompt. It tells Claude to use ketch in place of `curl` to read
pages, and names `ketch crawl`, `ketch code`, `ketch docs` and
`ketch doctor`.

Run the tests with `claude plugin test plugins/ketch-first` from the repo
root.
