# email-guard

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
