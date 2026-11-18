---
name: humanize
description: Audit or rewrite reader-facing copy (interface strings, pages, mails, release notes, error messages) for writing that reads as generated, under the project's own voice. Use before you ship copy you wrote, when asked to review, check, humanize or de-slop copy, and when copy "sounds like AI".
argument-hint: "[audit | rewrite] <file, folder or pasted text>"
---

# Humanize

Copy is everything a person reads: a page, a control, an error, a mail, a release note. This skill reads copy the way its reader does, a whole page or mail at a time, and finds the patterns that make it read as generated.

There are two modes:

- **Audit** is the default. Report findings and change nothing.
- **Rewrite** runs only when the person asks for it ("rewrite", "fix it", "apply the fixes"), or on copy you are drafting yourself.

When you write or change copy yourself, audit your draft before you show it.

## Terms

- A **unit** is what a reader takes in at one sitting: one page, one mail, one dialog or flow, one release's notes.
- A **string** is one piece of a unit that renders on its own: a label, a hint, a heading, an error, a paragraph, a mail's subject. The sentences inside one string are neighbours too.
- The **profile** is the project's own slot: its reader, voice, words, limits, where play may go, and which text is legal.

## Steps

### 1. Load the profile

Look for the profile in this order:

1. `.claude/humanize.md` in the project root.
2. A file or section that the project's `CLAUDE.md` or `AGENTS.md` names as its copy rules.

With no profile, infer the reader from the copy itself and use the default voice: plain, in the reader's own words, the way a person who knows the product would tell a friend. The defaults in [references/patterns.md](references/patterns.md) apply.

Done when you can state the reader and the voice in one line each.

### 2. Gather the units

In code, collect every string a unit renders, in render order, including the strings that show only in some states (empty, error, signed out).

Done when each unit is listed with its strings in reader order.

### 3. Read each unit whole

Read the unit top to bottom before you judge any string. Then read every string against every rule in [references/patterns.md](references/patterns.md). Read that file in full on every run, because the profile changes how some rules apply.

Legal text (terms, privacy, consent, licences, anything the profile lists as legal) is read like any other unit, with one exception: its findings go to the owner, as step 5 shows.

Done when every rule has been checked against every unit.

### 4. Weigh density

Part 2 of [references/patterns.md](references/patterns.md) lists the patterns of generated writing. A pattern from part 2 is a **finding** when:

- it occurs twice or more in one unit, or
- it returns across units of one kind, such as the same closing line on every mail, or
- its unit holds two or more different part 2 patterns, which makes the unit dense.

Any other part 2 pattern is **kept once**. Report it as kept once, not as a finding.

The rules in part 3 are findings at one occurrence. So is every hard limit in the profile. Part 3 findings do not count toward the density of part 2.

Where a part 3 rule needs code to check, such as a time limit read from a setting, and only the copy is in reach, say under Other notes that it was not checked.

When one string matches several rules, it is one finding that names every rule, with one fix.

### 5. Report (audit)

```markdown
Profile: <path> | none (I can write one with you from the template)
Reader: <one line>
Voice: <one line>

## <unit> (<path or place>)

Reads as: <one line on the unit as a whole>

Findings
1. "<smallest span that shows it>": <rule, rule>. <Why here: the count, or the neighbour it matches>. Fix: cut | "<proposed words>"

Kept once
- "<span>": <pattern>, stands once

Other notes
- <a problem that is no pattern, such as a heading that greets the wrong reader, or a fact that contradicts another unit>

Owner decides (legal text only)
- "<span>": <rule>. Proposed: "<words>"

Reads clean: <unit>, <unit>
```

Leave out a section that would be empty. Propose a cut before a new wording wherever the string adds nothing the reader needs. Proposed words follow the rewrite rules in step 6, placeholders included.

### 6. Rewrite (only on request)

A rewrite repairs findings. Its rules:

- Change only the strings with findings. Leave every other string exactly as it is. Other notes are not repaired unless the person asks.
- Remove the pattern and keep every fact, number, link, name, date, period and condition. A fact may move to a neighbouring string that the reader sees with it.
- Cut a string when it holds no fact the reader needs, or after its facts have moved. A cut is often the best repair.
- Never replace one pattern with another. When several strings get a new shape, vary them, or cut the line where it is not needed.
- Add no fact, promise, joke or reassurance that the old copy did not hold. Where a rule needs a value the copy does not hold, such as the minutes before a link stops working, write a placeholder like `{link lifetime in minutes}` and list it under "Needs from the owner". Never invent the value.
- Legal text is never rewritten in place. Its proposals stay under "Owner decides", and the owner decides each one.

```markdown
## <unit>

1. "<old string>"
   → "<new string>" | (cut)

Facts kept: <each fact, number, link and condition of the changed strings, and where it now stands>
Patterns kept: <string, pattern, reason> | none
Needs from the owner: <placeholder, what it stands for> | nothing
Re-read: <one line: what step 7 found>
```

When the rewrite goes into a commit or a pull request, its message names each pattern kept, with the string and the reason.

### 7. Read the rewrite again

Read each changed unit whole once more, against the rules. Look hardest for a new template: the same repair given to several strings.

Done when the facts check is complete and no changed unit holds a new finding.

## Large jobs

For a whole site, a set of mails or every release note, follow [references/large-jobs.md](references/large-jobs.md).
