# Global instructions

## Web research: use ketch

`ketch` is installed at `~/.local/bin/ketch`. Use it through Bash as the default tool for web search, fetching pages and scraping. Use it instead of the built-in WebSearch and WebFetch tools and instead of `curl` for reading web pages.

- Search: `ketch search "<query>"`. Add `--limit N`, or `--scrape` to get the full text of each result.
- Fetch or scrape one or more URLs as markdown: `ketch scrape <url> [<url>...]`. This also works for text-based PDFs.
- Crawl a site: `ketch crawl <url>`.
- Search public source code: `ketch code "<pattern>" --lang <lang>`.
- Library and framework docs: `ketch docs "<library>"`.
- Add `--json` for structured output, and `--max-chars N` to limit long pages.
- Run `ketch <command> -h` for flags, and `ketch doctor` if a backend fails.

Fall back to WebSearch or WebFetch only when ketch fails or cannot reach the content. Say so when you fall back. For pages that need a login, use the browser tools or `gh` instead.
