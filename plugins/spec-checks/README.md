# spec-checks

An OpenSpec working practice, the checks that hold specs to it, and a viewer
for the specs. It has four parts:

- The `practice` skill: how a change is proposed, applied and archived, how a
  spec is written, how each scenario maps to a test, and how a sweep finds
  specs that disagree. Each step's reference loads only at that step.
- The `spec-checks` CLI, on the Bash PATH while the plugin is on.
- A hook that runs `spec-checks validate` and `spec-checks dropped` after a
  tool call that touches `openspec/specs`. On a failure, Claude gets the
  problems.
- The `view` skill: Claude starts `spec-checks view` and gives you the
  address of the specs as web pages.

The practice, the checks and the hook do nothing in a project without
`openspec/checks.json`. That file is the opt-in, and the `openspec-migrate`
skill offers it. The viewer needs only `openspec/specs`.

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

`spec-checks view` shows the main specs as web pages at
`http://127.0.0.1:4747/`, or at a free port when 4747 is in use. Each
requirement marks its SHALL, MUST, SHOULD and MAY. Each scenario shows its
steps, and its test from the coverage map or the reason it has none. An open
page reloads when a spec, a coverage map or the not-yet list changes. The
viewer only reads, and it answers only requests addressed to 127.0.0.1,
localhost or [::1]. In a project
without `openspec/checks.json`, the pages show no coverage. `--port <n>` names
the port, `--open` opens the page in the default browser, and `--root <folder>`
names the project. `/view.json` holds the data of the pages.

The coverage check parses test files with the TypeScript compiler API. It loads
`typescript` from the project. TypeScript 7 ships without that API, so a
project on 7 adds `@typescript/typescript6` as a dev dependency, the package
TypeScript publishes to run beside 7, and the check loads that instead. The project templates are in
`plugins/spec-checks/templates/`. Run the tests with
`cd plugins/spec-checks && pnpm install && pnpm test`.
