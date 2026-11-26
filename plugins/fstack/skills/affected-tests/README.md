# affected-tests

Each subagent runs only the tests its changes can reach, and the full suite
runs once per batch. The skill holds the rules and one reference per test
stack: Turborepo, Vitest, Playwright and `node --test`. Its templates go into
a project's scripts folder, and the project owns them:

- `verify.mjs`, with `--affected` and `--base <ref>`. `--list` prints each
  changed file, the rule it matched and the commands a run starts, and runs
  nothing. `--affected` refuses to run until `--list` printed the same list.
- The scope rules, and a guard test that fails when a test reads a file in
  another package with no entry that runs it.
- A machine-wide lock, so only one heavy job runs at a time.
- A record of a pass on a clean tree, so a merge step skips a second run.
