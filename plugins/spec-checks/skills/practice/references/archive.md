# Sync and archive a change

The sync gate is the last time anyone reads the change's rules before they become the main specs. Deltas often change between the proposal and the archive, and a rule that was merged or turned into prose to pass a check still passes every check.

## Steps

### 1. Stop at the sync question

The `openspec-archive-change` skill asks whether to sync the delta specs. If you are not the reviewer for the sync gate, stop there, and report the question with the printout of:

```bash
spec-checks gate <change>
```

`gate` prints each requirement of the change's deltas at the proposal gate and now. It also prints the state of design.md since the gate: unchanged, added to with every gate line kept, or rewritten. For a rewritten design.md it lists the gate lines that are gone. See [propose.md](propose.md) for how the gate commit is found.

Done when the reviewer has the question and the printout.

### 2. Read the printout, then answer

The reviewer reads the printout before answering. Look at each requirement that changed since the gate for these:

- a SHALL sentence that is gone,
- two SHALL sentences merged into one,
- a rule turned into prose,
- a scenario that is gone,
- a design.md that is rewritten.

A rewritten design.md means a decision changed in place. The change belongs under `## Changed during apply`, as [apply.md](apply.md) says under *A changed design decision is a stop*. Send it back to apply, to restore the gate lines and record the change there.

A merge can change what a rule says. [writing-specs.md](writing-specs.md) shows how, under *A check is satisfied by adding a scenario*. Send each such requirement back to apply, to restore the rule and add the scenario. A requirement reworded at the sync is read again against its claims, as [apply.md](apply.md) says under *A rule reworded after the gate*.

Then answer: sync now. Always sync before archive. Archiving without a sync leaves the main specs describing a system that no longer exists. It also moves the delta into `openspec/changes/archive/`, where the gap is much harder to notice.

A capability that the archive skill reports as sync-blocked goes to the person who owns the specs. Sync the rest.

Done when the reviewer answered "sync now" or sent the blocked capabilities to the person who owns the specs.

### 3. Name each rule that goes on purpose

`spec-checks gate --check` takes no change. It checks every change whose files the branch changed, and fails on a rule that left a delta after the gate unnamed. When the proposal merged before the branch started, it counts only the rules dropped since the base. An earlier branch already answered for the rest. A rule dropped with its scenario is a removal that a reviewer sees. A rule dropped alone is how a merged sentence hides.

Where a rule was meant to go, name it in proposal.md:

```markdown
## Rules dropped after the proposal

- <requirement>: <why it goes>
```

This section is the one override that `gate` accepts. Use it only for a rule that the reviewer agreed to drop.

Done when `spec-checks gate --check` passes.

### 4. Verify after the archive

The archive skill compares each main spec with its delta after the sync, then moves the change to `openspec/changes/archive/`. Then run:

```bash
spec-checks verify
```

It runs every check that `openspec/checks.json` lists, then each command in `extra`. Fix what fails before the branch merges. [writing-specs.md](writing-specs.md) and [scenario-coverage.md](scenario-coverage.md) say what each check wants.

Done when the change is in `openspec/changes/archive/` and `verify` passes.
