# Propose a change

The proposal gate is the commit at which the reviewer approved the proposal. Everything after it is measured against it, at the sync gate and by `spec-checks gate`.

## Steps

### 1. Write the proposal

Run the `openspec-propose` skill on the issue's branch. Write the delta specs as [writing-specs.md](writing-specs.md) says.

Done when proposal.md, the delta specs and tasks.md exist for the change.

### 2. Check the change against the claims it meets

OpenSpec validates each spec alone, so a change can contradict a sweeping sentence in a spec it never touched. Run:

```bash
spec-checks claims <change>
```

It prints the absolute claims in other specs that share a glossary term with the change, closest first. A claim is a SHALL sentence with *any*, *anywhere*, *anything*, *anyone*, *every*, *everything*, *everywhere*, *never*, *no*, *nothing*, *none*, *nobody*, *only* or *whatever*, or a list. The glossary terms are the `**Term**:` lines in the file that `glossary` in `openspec/checks.json` names. It prints the closest 20 claims, and `--all` prints every one.

When `glossary` is `null`, or its file defines no terms, `claims` stops with an error. Then search the other specs yourself: find each SHALL sentence with one of those words that names a noun the change names.

Read each claim against the change. The CLI points, and you judge.

Where the change contradicts a claim, do one of these:

- change the change,
- say in proposal.md why the claim gives way, and change that spec in the same change.

Then add this section to proposal.md, with one line for each claim you checked:

```markdown
## Claims checked

- <capability> › <requirement>: <what you found>
```

Example from a library loan app. A change lets a member renew a loan at the self-service kiosk. `claims` prints *"A loan SHALL only be renewed from the member's account page"* in another spec. The change makes that sentence give way, says so in proposal.md, and edits that spec too.

Done when every claim you found has a line under `## Claims checked`.

### 3. Preview the specs as they will sync

Most checks read `openspec/specs/` only. A fault in a delta spec then shows only after the sync, when the build is done. Run:

```bash
spec-checks preview <change>
```

It syncs the change into a copy of the specs and runs `validate`, `shall` and `repeated` on that copy. It also runs each `extra` entry in `openspec/checks.json` that is written as `{ "name", "command", "preview": true }`. It changes nothing in the checkout. Fix each fault it reports in the delta specs.

`preview` does not run `coverage`. A new scenario with no test yet is work for apply. See [scenario-coverage.md](scenario-coverage.md).

Done when `preview` reports no fault that the delta specs can fix.

### 4. Review the proposal

Read the proposal as the reviewer will. Take each decision it raises to the person the project's AGENTS.md names for that decision.

Done when no open decision remains in the proposal.

### 5. Commit the gate

Commit the proposal with the trailer:

```bash
git commit -m "Propose <change>" --trailer "Spec-Gate: <change>"
```

A commit that corrects the proposal before apply starts carries the same trailer. The newest commit with `Spec-Gate: <change>` is the gate. If no commit has the trailer, the gate is the commit that added the change's proposal.md. When the change has neither, name the gate by hand with `spec-checks gate <change> --gate <commit>`. A trailer names the gate in the commit itself, because a commit hash changes when the branch is rebased.

Done when the reviewer approved the proposal and the gate commit is pushed.
