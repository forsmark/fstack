# Write a spec

These rules apply to every main spec in `openspec/specs/` and every delta spec in `openspec/changes/`. Each rule has a check in `spec-checks`. Check the whole set with `spec-checks verify`, and one rule with its own command.

## How the checks judge

Every check compares with a base: the merge base of HEAD and the first ref in `baseRefs` of `openspec/checks.json` that exists.

A **baseline** is a `*-not-yet.txt` list of the faults the specs held when a check came. `baselines` in `openspec/checks.json` names each one. A baseline only shrinks:

- a line that is not on the list at the base fails,
- a count higher than at the base fails,
- a stale line fails, until `--write` rewrites the list.

A baseline list that the base lacks counts as empty when the base already had `openspec/checks.json`. So a new list cannot start with faults. A list starts with faults only on the branch that adopts the checks.

So fix a fault rather than adding its line. After you fix one, run the check with `--write`, and commit the shorter list.

A hook runs `spec-checks validate` and `spec-checks dropped` after each tool call that touches `openspec/specs/`. Fix what it reports before your next edit.

## Every SHALL sentence has a scenario

A requirement has at least as many scenarios as it has sentences that say SHALL or SHALL NOT. The coverage map reaches a rule only through a scenario. A rule written only in a requirement's text reaches no test, and two such rules can contradict each other unseen.

`spec-checks shall` checks it. It cannot tell which scenario shows which rule, so where the sentences outnumber the scenarios, read them and add a scenario for each rule that no scenario shows. `spec-checks shall --report` lists every gap with its sentences.

A sentence that states no rule, such as one that only points to another requirement, does not say SHALL. Reword it.

Done when `spec-checks shall` passes.

## A check is satisfied by adding a scenario

To satisfy a check, add a scenario. Never merge two rules into one sentence, and never turn a rule into prose. Both hide a rule from the count, and a merge can change what the rule says.

Example from a library loan app. *"A loan record SHALL be deleted when the member closes the card"* merged into *"A loan record is kept until the card is closed"* reads the same at a glance. The first sets an upper limit. The second sets a lower limit, and it now contradicts the spec that deletes loan records after 90 days.

## A fact lives in one spec

A fact lives in one spec. Another spec that needs it refers to it by capability and requirement, as "the opening hours that `branch-hours` defines in *A branch lists its weekly hours*". A copy drifts when only one side changes.

A spec that names the owner and then repeats the list still holds a copy. Name the owner, and leave the list there.

`spec-checks repeated` finds the same list in two specs. Where two specs legitimately state one list, reword one side to point to the other. Do not add a baseline line. After you resolve a copy, run `spec-checks repeated --write`.

Some values have one owner requirement, such as how long data is kept or how long a link works. The project's AGENTS.md or `openspec/config.yaml` names those owners. Cite the owner wherever another spec states the value.

Done when `spec-checks repeated` passes.

## A requirement stays under OpenSpec's limit

OpenSpec refuses a requirement whose text above its first scenario is over 500 characters. `spec-checks validate` runs `openspec validate --specs --strict` and fails on its errors. A long requirement passes only while the baseline lists it. A requirement you add or rename is not on the baseline, so write it short.

To shorten a requirement:

- **Split by behavior.** A requirement that states several behaviors becomes one requirement per behavior. Keep the old name for the behavior that other specs refer to, and add the others beside it.
- **Keep the reason.** A reason stays in its requirement, in fewer words. It does not move to `design.md`.
- **Move examples and edge cases into scenarios.**

A scenario that moves to a new requirement has a new key in the coverage map. See [scenario-coverage.md](scenario-coverage.md).

Done when `spec-checks validate` passes.

## A requirement leaves only through a delta

A requirement leaves a main spec only through a delta of the same capability that names it, under `## REMOVED Requirements` or as the old name under `## RENAMED Requirements`. A sync that drops a requirement leaves a well-formed file, so validation passes and the requirement is simply gone.

`spec-checks dropped` finds a requirement that left without such a delta. It sees committed and uncommitted edits.

Done when `spec-checks dropped` passes.
