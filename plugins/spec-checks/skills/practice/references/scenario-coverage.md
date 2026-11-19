# Every scenario has a test or a reason

Every scenario in `openspec/specs/` has one entry in the coverage map. So a change that adds, renames or changes a scenario adds or updates its test or its entry in the same branch. A scenario with no entry is a rule that nothing shows to hold.

## The map

The map is one file per capability, `<mapDir>/<capability>.json`, with `mapDir` from `coverage` in `openspec/checks.json`. It maps requirement to scenario to entry. The key of a scenario is:

```
<capability> › <requirement> › <scenario>
```

The key holds all three names because scenario names repeat within a capability.

## The entry kinds

An entry is exactly one of these:

- **An end-to-end test.** `{"e2e": "<file> › <test title>"}`. The test names the key in a Playwright annotation, `covers('<key>')`. Write the title and the key as literal strings, so the check can read them without running the test.
- **A unit test.** `{"unit": "<file> › <test name>"}`. Where two tests in the file share the name, name the test by its describe block: `<file> › <describe> › <test name>`.
- **No test.** `{"none": "<reason>"}`, where the reason says why no test can show the scenario.

The project's AGENTS.md says whether a user flow needs an end-to-end test, and when a unit test or "none" is enough.

Example from a bike repair booking app:

```json
{
  "A customer books a repair slot": {
    "A booked slot leaves the free list": {
      "e2e": "e2e/tests/booking/book-slot.spec.ts › a booked slot no longer shows as free"
    },
    "Two customers book the same slot": {
      "unit": "src/booking/slots.test.ts › second booking of a slot is refused"
    }
  }
}
```

## A scenario that changes

A scenario whose GIVEN, WHEN or THEN changes under the same name keeps its key and its entry. Update the test that its entry names, in the same branch.

Where you read the test again and it already shows the new text, leave the test alone and say why on the entry with `checked`:

```json
"<scenario>": {
  "e2e": "<file> › <test title>",
  "checked": "<why the test already shows the changed text>"
}
```

This fits a change that only rewords a step the test never asserted. Read a "none" entry again the same way: change its reason, or add `checked` to say why it still holds.

`spec-checks coverage` fails on a changed scenario when neither its test file nor its entry changed and it has no new `checked`.

A `checked` speaks for one version of the scenario's text. When the scenario changes next, remove the `checked` or rewrite it for the new text. A `checked` that the base already had fails, because it was written for the earlier text.

A renamed scenario has a new key, so it needs an entry like an added one. So does a scenario that moves to another requirement.

## The not-yet list

`<mapDir>/not-yet.txt` is the baseline for this check. It lists the scenarios that no test covered when the check came. A new scenario cannot go on the list, so it gets its entry when it is added. [writing-specs.md](writing-specs.md) says how a baseline judges.

Once you map scenarios from the list, run:

```bash
spec-checks coverage --write
```

It rewrites the list without the scenarios now mapped.

Done when `spec-checks coverage` passes.
