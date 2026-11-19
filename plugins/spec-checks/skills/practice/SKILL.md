---
name: practice
description: The working practice for OpenSpec changes and specs, checked by the spec-checks CLI. Use in a project that has openspec/checks.json, when you propose, apply or archive an OpenSpec change, or write or edit a spec.
---

# Spec practice

This practice applies only in a project that has `openspec/checks.json`. Without that file, the `spec-checks` commands stop with an error. Then follow the OpenSpec skills alone.

The specs in `openspec/specs/` say what the system does. This practice keeps them true while changes go through, and the `spec-checks` CLI checks most of it.

## When a change goes through OpenSpec

Before you build an issue, decide whether it changes what a spec says, or adds behavior that no spec describes. If it does, the work carries an OpenSpec change: it is proposed, applied and archived. Whether all three happen in one pull request is the project's choice. The project's AGENTS.md says.

These need no change:

- a fix that makes the code do what a spec already says,
- tooling or docs that no capability covers.

When you are unsure, the issue needs a change.

## The two gates

A change stops at two gates:

1. **The proposal gate**, after propose. A reviewer approves the proposal before apply starts.
2. **The sync gate**, before archive. The archive skill asks whether to sync, and the reviewer answers after reading what changed since the proposal gate.

The **reviewer** is the session or person that answers a gate. The project's AGENTS.md names the reviewer for each gate. It also says whether one session proposes and another applies.

## Steps

Read each reference when you reach its step, not before.

1. Propose the change. Follow [references/propose.md](references/propose.md).
2. Apply the change. Follow [references/apply.md](references/apply.md).
3. Sync and archive. Follow [references/archive.md](references/archive.md).

At any step:

- When you write or edit a spec or a delta spec, read [references/writing-specs.md](references/writing-specs.md).
- When you add, rename or change a scenario, or a coverage check fails, read [references/scenario-coverage.md](references/scenario-coverage.md).
- When someone asks for a sweep of all specs for disagreements, follow [references/sweep.md](references/sweep.md).

## What the project states

The project states these in its AGENTS.md or its `openspec/config.yaml`. Look there, and ask when neither says:

- who answers each gate,
- which branch is the base,
- how changes are released or batched,
- who owns a value such as a retention period,
- the exact limits the project sets,
- whether a user flow needs an end-to-end test.

The checks and the baselines are in `openspec/checks.json`. Run `spec-checks <command>` from the project root.
