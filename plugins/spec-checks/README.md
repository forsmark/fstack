# spec-checks

An OpenSpec working practice and the checks that hold specs to it. It has
three parts:

- The `practice` skill: how a change is proposed, applied and archived, how a
  spec is written, how each scenario maps to a test, and how a sweep finds
  specs that disagree. Each step's reference loads only at that step.
- The `spec-checks` CLI, on the Bash PATH while the plugin is on.
- A hook that runs `spec-checks validate` and `spec-checks dropped` after a
  tool call that touches `openspec/specs`. On a failure, Claude gets the
  problems.

All three do nothing in a project without `openspec/checks.json`. That file
is the opt-in, and the `openspec-migrate` skill offers it.

The checks, which `spec-checks verify` runs in the order the config lists:

| Check | Fails on |
| --- | --- |
| `validate` | an error from `openspec validate --specs --strict`, and a requirement over 500 characters |
| `coverage` | a scenario with no test and no reason in the coverage map, or a changed scenario whose test did not change |
| `shall` | a requirement with more SHALL sentences than scenarios |
| `dropped` | a requirement that left a main spec without a REMOVED or RENAMED delta |
| `repeated` | the same list in two specs |
| `gate --check` | a rule dropped from a delta after a person approved the proposal |

Each check compares with the merge base of HEAD and the first ref in
`baseRefs`. A check's baseline lists the gaps a project had when it adopted
the checks, and it only shrinks. In CI, a missing base is a failure, so the
job needs `fetch-depth: 0`.

The helpers are `gate <change>`, `claims <change>`, `preview <change>`,
`sweep-groups`, `sweep-dismissed` and `vendor`. `spec-checks --help` lists
them. `vendor` copies the CLI into the project at `tools/spec-checks/`, so CI
runs it without the plugin. The hook runs that copy when there is one.

The coverage check parses test files with the TypeScript compiler API. It loads
`typescript` from the project. TypeScript 7 ships without that API, so a
project on 7 adds `@typescript/typescript6` as a dev dependency, the package
TypeScript publishes to run beside 7, and the check loads that instead. The project templates are in
`plugins/spec-checks/templates/`. Run the tests with
`cd plugins/spec-checks && pnpm install && pnpm test`.
