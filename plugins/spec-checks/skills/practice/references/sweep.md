# Sweep the specs for disagreements

A sweep reads every spec in `openspec/specs/` for requirements that disagree. The checks read one spec at a time or compare lists, and `spec-checks claims` reads one change against the claims it meets. None of them sees two old requirements that drifted apart.

Run with no change, `spec-checks claims` audits every claim in the specs.

## When it runs

A sweep runs when a person asks for one, such as before a milestone. It is never a gate. It does not run in `spec-checks verify` or before a merge, because a reader is not deterministic and a false alarm would stop a merge.

## The groups

Each reader takes one group of specs. The specs in a group share terms, so a reader sees both sides of most disagreements. `sweep.groups` in `openspec/checks.json` lists the groups, and every spec is in exactly one.

A change that adds a capability adds it to the nearest group. A change that removes a capability takes it out. Before each sweep, run:

```bash
spec-checks sweep-groups
```

It fails when a spec is in no group or in two. Fix the groups first.

## What counts as a disagreement

Two passages disagree when some case makes them say different things, and a reader, a test or the code cannot follow both. The two passages are usually in two specs. They can also be in one spec, or be a requirement and a scenario.

It counts:

- An upper limit in one spec and a lower limit in another, as "a loan record is deleted 90 days after return" against "a loan record is kept while the card is active".
- A list that says it is complete, and another spec that adds to it.
- One fact with two values, such as a size, a count, a time or a name.
- A rule with *no*, *never*, *only* or *every*, and a requirement elsewhere that makes an exception the rule does not name.
- A reference to a requirement that says something the requirement no longer says.

It does not count:

- A spec that gives the main case and refers to the spec that owns the rule.
- A general sentence that the section it sits in clearly scopes.
- A case neither spec states, unless both readings reach a user.
- Two places that present one fact differently on purpose.
- A stricter value that meets a looser limit, as a 30-second timeout under a 60-second ceiling.
- Code that handles a state the specs say cannot happen.
- A spec and the code that disagree while the specs agree. That is a bug. File it as the project's issue tracker says.
- Wording, style, or a stale scenario title whose text is right.
- A pair in the dismissed file whose requirements have not changed since the pair was listed.

## The form of a finding

Each reader returns its findings as text, one paragraph each:

- An id: a short prefix for the group and a number, as `L1` for a group named `loans`.
- A confidence: certain, likely or possible.
- The fact in one line, as "how long a returned loan's record is kept".
- Each side: its `openspec/specs/<capability>/spec.md:<line>`, its requirement's name, and a short quote.
- Which side the code follows, with its file and line, or "not checked".

## Steps

### 1. List the changed dismissed pairs

Run:

```bash
spec-checks sweep-dismissed
```

It lists the dismissed pairs whose requirements changed after the pair was listed. Give each reader this list with the dismissed file.

Done when you hold the list.

### 2. Start one reader per group

Start one fast reader agent per group, all in parallel. Each reader:

1. reads the dismissed file, and skips each listed pair that `sweep-dismissed` did not list,
2. reads its group's specs in full,
3. searches the other specs for the terms its group defines,
4. returns findings in the form above, and edits no file.

The readers are fast because they only point. A reader's confidence is not a verdict.

Done when every group's reader has returned.

### 3. Judge every finding

Start one stronger agent to judge every finding before any issue is filed. For each finding it reads both sides in full, the code that implements them, and the history: the commits that last changed each side, and the archived change that wrote it. It gives each finding a verdict:

- **real**, with the side that should give way,
- **dismissed**, with a reason in one line.

Done when every finding has a verdict.

### 4. Ask the person to confirm

Show the person the verdicts as a table. The person confirms or overrules each one.

Done when the person has confirmed or overruled every verdict.

### 5. Record the outcome

- Each real finding becomes an issue, or joins one, as the project's issue tracker says. A finding that an open issue already holds is not filed again.
- Each dismissed pair goes into the dismissed file, in a pull request against the project's base branch.

Done when each real finding has its issue and each dismissed pair has its line.

## The dismissed file

`sweep.dismissed` in `openspec/checks.json` names the file. It holds one line per dismissed pair:

```
<capability> › <requirement> ⇄ <capability> › <requirement> › <why> › <date>
```

A side that is not a requirement says what it is instead, such as a scenario title or a file of code. A finding with more than two sides takes one line per pair.

A pair that `sweep-dismissed` lists is read again in full. Update its line or remove it, with the new verdict.
