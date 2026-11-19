# Apply a change

Apply builds what the gate approved. A change can ship with every task ticked and the suite green, and still leave a SHALL sentence untrue. These rules close the two ways that happens: a correction that reaches only one task, and a verification that checks the wrong thing.

Run the `openspec-apply-change` skill. Follow these rules as you work through tasks.md.

## Verify the scenario, not something next to it

A task's verification clause is what gets checked. If it checks a neighboring behavior, the task can be ticked truthfully while the behavior it describes stays unbuilt.

Write each verification against the spec scenario that the task exists to satisfy. Prefer a check of the stored value to a check of a behavior that comes with it.

Example from a bike repair booking app. The scenario says *"the booked mechanic SHALL be stored on the booking"*. The clause "a second lookup of the booking makes no request to the roster" checks caching. A design that caches the mechanic in another table passes it, and the booking still holds no mechanic. The clause "the booking's mechanic field holds the booked mechanic" checks the scenario.

No check compares a verification with its scenario. That one is your judgement.

## A changed design decision is a stop

The reviewer approved `design.md` at the gate. A design rewritten in place leaves the archive without what was approved. So when a decision in `design.md` cannot hold:

1. Leave the text of `design.md` as it is.
2. Add the change at the end of `design.md`, under `## Changed during apply`, as a heading `### <date>: <the decision that changed>`, with the reason.
3. Commit and push. Then stop, and report the change to the reviewer.

The reviewer takes the change to the person who made the decision, when it touches one. Otherwise the reviewer answers, and you go on.

## Propagate a correction to the tasks it invalidates

A design decision that changes during apply usually invalidates more than the task that found it. When you correct a design:

1. Read the remaining tasks again against the spec, not against each other.
2. Change each task that depends on the old design.
3. In the note of the task that found it, name the other tasks the correction touched.

A correction recorded in one place and applied in one place is how a task list drifts from what is built.

Example from the bike repair booking app. Task 2.1 finds that a slot cannot hang off the mechanic, because an unassigned booking has no mechanic. Task 3.2 still says "store the slot on the mechanic". Unless 3.2 changes too, it builds the design that 2.1 abandoned.

## A rule reworded after the gate

Proposal.md lists, under `## Claims checked`, the claims each requirement was read against. When you reword a requirement after the gate, read it again against the claims it names there. Where the new wording changes a rule, run `spec-checks claims <change>` again and update the section.

## Before you tick the last task

Walk the change's delta specs. For each scenario, name the task that verifies it. A scenario with no such task is unbuilt or untested. Find out which before the archive, because the archive moves the delta out of `openspec/changes/` and the question gets much harder to ask.

Each scenario also needs a test or a reason in the coverage map. See [scenario-coverage.md](scenario-coverage.md).

Done when every task is ticked, every scenario of the delta specs names its task, and every scenario has an entry in the coverage map.
