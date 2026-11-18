# fstack

Forsmark's Claude Code stack: plugins, skills, output styles and global
instructions. The repository is also a plugin marketplace, named `fstack`.

```
plugins/        function-hook plugins (mods), installed from the fstack marketplace
skills/         skills, linked into ~/.claude/skills/
output-styles/  output styles, linked into ~/.claude/output-styles/
global/         CLAUDE.md, linked to ~/.claude/CLAUDE.md
install.sh      links and installs all of the above
```

## Install

```
git clone https://github.com/forsmark/fstack.git ~/dev/fstack
~/dev/fstack/install.sh
```

The script links each skill, output style and the global `CLAUDE.md` into
`~/.claude/`, and moves a file that stands in the way to `<name>.bak.<time>`.
It adds the folder as the `fstack` marketplace and installs every plugin at
user scope. Run it again after you add a skill or a plugin: what is in place
stays as it is.

Because everything is linked or read from the folder, an edit applies at once
for skills, output styles and `CLAUDE.md`, and on `/reload-plugins` for
plugins.

One plugin alone, from GitHub without a checkout:

```
/plugin install cache-warmer --marketplace forsmark/fstack
```

This is a private repository: installing from GitHub needs read access and a
git credential for github.com on the machine (an SSH key, or `gh auth login`
then `gh auth setup-git`).

## Adding to the stack

- A plugin goes in `plugins/<name>/` and gets an entry in
  `.claude-plugin/marketplace.json`.
- A skill goes in `skills/<name>/SKILL.md`.
- An output style goes in `output-styles/<name>.md`.

Then run `install.sh`.

## Plugins

### cache-warmer

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

### email-guard

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

Edit the address list in `EMAILS` at the top of `plugins/email-guard/hooks/register.ts`.
Run the tests with `claude plugin test email-guard`.

### usage-limits

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

### pocket

A pocket for questions that Claude has for you while you are away. Claude puts
a question in the pocket and continues with other work. You see that questions
wait, open the pocket when you are ready, and answer. The answer reaches
Claude as your own message, with the question attached.

Each pocketed question holds what you need to answer it cold: the question in
one sentence, the context, the options with what each leads to and the
recommended one marked, what Claude does in the meantime, how urgent it is,
when Claude asked, and what it relates to.

What you see:

- A row above the prompt, only while the pocket holds something:
  `pocket: 3 open, 1 blocks work, oldest 4h`. Its `open` button opens the
  pocket in a pane.
- `/pocket` lists every question in full, with a button for each option and a
  field for your own answer. In the terminal it also opens the pane, and the
  row in the transcript is then one line. There the list is shown to you only. It goes in no request, so it costs no tokens.
- On the phone and on the web, through Remote Control, `/pocket` prints the
  list as plain text, with the command that answers each question. They show
  no row above the prompt, no pane and no buttons. Claude reads that text
  too, so a list from there costs the tokens of the questions it shows.
- A question that blocks work also raises one notification when Claude
  pockets it. There is no other reminder.

How you answer:

- Press an option, or type your own answer in the field.
- Or type `/pocket 1 a` for option a of Q1, or `/pocket 1 keep them until
  Monday` for your own answer. `/pocket 1` shows Q1 alone.
- `/pocket` runs while a turn is in flight. An answer never interrupts the
  turn: Claude gets it when the turn ends. Several answers go out together as
  one message.

What Claude gets is one line for each answer, as a user message:

```
Pocket answer Q1 "How many days do we keep a deleted record?": a, 100 days
```

Beside it Claude gets a note from the plugin with the record of each answered
question, so it does not need to recall the question.

What Claude calls:

- `mcp__pocket__ask` pockets a question and returns its id. Its description
  holds the rules: pocket a decision that is yours and can wait, decide the
  rest itself, and do not repeat a pocketed question in later messages. One
  rule tells Claude to end each status message with `Pocket: <n> open` while
  questions wait, because the phone and the web show no other sign.
- `mcp__pocket__update` changes a question or withdraws it with a reason. You
  see a changed question as edited. A withdrawn question stays in the list
  with its reason until you dismiss it, with its button or `/pocket dismiss`.
- `mcp__pocket__list` lists the open questions.

The tools never raise a permission prompt. Only the main session pockets
questions: a subagent gets an error that tells it to return its question to
its caller.

Trust: Claude writes every text in a question, and only the answer has your
authority. So no tool answers a question. An answer comes only from a button
press, or from a `/pocket` command typed at the terminal or sent through
Remote Control. A `/pocket` answer from any other origin is refused. Claude
cannot tell the answer line from a message you typed, so this check is the
whole protection.

Questions live in `~/.claude/pocket/<project>/`, one JSON file each, so they
survive a compaction and a restart. A closed question moves to `done/` there.
After a compaction, and at the start of a session, Claude is told which
questions are open. A second session in the same project sees the same
questions. An answer goes to the session where you give it.

What it does not do:

- An answer does not reach Claude in the middle of a turn. It waits for the
  turn to end.
- A session shows a change that another session made only after its next turn
  or its next `/pocket`.
- Two sessions that pocket a question in the same instant can take the same
  id. The later file then replaces the earlier one.
- An answer that was not delivered goes out again only from the session that
  took it. If that session never returns, read the answer from the file.
- It has no view of what is running.

Run the tests with `claude plugin test pocket`.

### image-preview

Shows images from tool results inline in the terminal transcript, under the
tool row. The web and mobile clients already show these images. This mod
draws them in the terminal client too.

It finds images in these results:

- The Read tool on an image file.
- MCP tools that return image blocks, such as browser screenshots.
- Bash output that Claude Code marks as an image.
- Reads that the transcript folds into one count line ("Read 2 files"). The
  images go under that line.

Requirements:

- A terminal with the kitty graphics protocol: kitty or Ghostty. iTerm2 3.5
  and later works in fullscreen rendering. Elsewhere the mod shows a dim line
  such as `[png image 640x360]`.
- PNG images need nothing more. JPEG, GIF, WebP and PNG files over 2 MiB need
  `python3` with Pillow, which converts them to PNG.

Inside a multiplexer such as herdr, Claude Code does not detect image support:
it allows images only when the terminal reports itself as `kitty` or
`ghostty`. Set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` before Claude Code starts
to skip that check. For herdr, in `~/.zshrc`:

```
[[ $TERM_PROGRAM == herdr ]] && export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
```

This variable comes from the Claude Code binary, not its documentation, so a
later release can change it.

`/image-previews off` and `/image-previews on` turn the previews off and on.
With no argument the command toggles. The setting persists across sessions.

The constants at the top of `plugins/image-preview/hooks/register.tsx` set the largest
preview (`MAX_COLUMNS`, `MAX_ROWS`) and the cell shape (`CELL_ASPECT`, cell
height divided by cell width). If previews look stretched or squashed, change
`CELL_ASPECT`.

## Skills

### humanize

It audits and rewrites reader-facing
copy (interface strings, pages, mails, release notes, errors) for writing that
reads as generated. It reads a page or a mail whole. A pattern of generated
writing counts only where it returns or shares its page with other findings.
One pattern, once, can stay.

```
/humanize audit src/pages/signup
/humanize rewrite mails/welcome.html
```

Audit is the default and changes nothing. A rewrite runs only on request. It
removes the pattern and keeps every fact, number, link and condition, and it
never rewrites legal text in place. Claude also reaches for the skill by itself
when it writes copy.

Each project states its own reader, voice, words, limits and legal text in
`.claude/humanize.md`. The skill offers to write one from
`references/profile-template.md`. For a whole site it follows the review method
in `references/large-jobs.md`.

## Output styles

### simple-technical

Plain, single-meaning prose that follows the structural rules of ASD-STE100
Simplified Technical English. Pick it with `/output-style`.

## Global instructions

`global/CLAUDE.md` is linked to `~/.claude/CLAUDE.md`, the instructions every
session loads. It tells Claude to use `ketch` for web search and fetching.
