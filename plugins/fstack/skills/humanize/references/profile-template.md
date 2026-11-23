# Reader copy profile template

A profile is the project's own slot for the `humanize` skill. Save it as `.claude/humanize.md` in the project root. The `humanize` skill applies its general patterns with what this file says.

Write it with the person who owns the copy. Ask them for each section, and leave out what does not apply. Keep the profile short: the skill reads it on every run.

```markdown
# Reader copy profile

## Reader
<Who reads the copy, what they already know, and what they come to do. One to three lines.>

## Voice
<How the copy sounds, in one or two lines, as a person, not as adjectives. For example: "a colleague who has used the tool for years and tells you only what you need".>
<One or two real sentences from the product that sound right.>

## Words
- Reader words: <internal term> is shown as <reader word>. <Repeat for each term. Or name the glossary file that holds them.>
- Never shown: <internal words a reader must not see: system names, job names, data model names>.
- Same word every time: <terms that must not rotate with synonyms>.

## Limits
- <Hard limits, each one a finding at one occurrence. For example: "a release note line is 20 words at most", "no emoji", "no exclamation marks".>
- You and we: <the default ("you" is the reader, "we" is the people who run the product and never the software), or the project's own rule>.

## Play
- May carry one beat: <the places, such as empty states, the welcome mail or the 404 page>.
- Never: <the places with no play, beyond the defaults (privacy, consent, payment, deletion, account mails, statuses, dates)>.
- Jokes are never about: <for example customers, competitors, or the people in the product's listings>.

## Legal and fixed text
<Files, pages or strings that a rewrite never changes in place: terms, privacy, consent lines, licences, text another team owns. The owner decides each change.>

## Where the copy lives
<Paths of string files, templates, mail sources and release notes, so a check can find every unit.>

## Patterns kept on purpose
- <string or place>: <pattern>, because <reason>.
```
