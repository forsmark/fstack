# humanize

It audits and rewrites reader-facing copy for writing that reads as generated:
interface strings, pages, mails, release notes and errors. It reads a page or a mail whole. A pattern of generated
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
