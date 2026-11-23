# affected-tests

Each subagent runs only the tests its changes can reach, and the full suite
runs once per batch. The skill holds the rules and one reference per test
stack: Turborepo, Vitest, Playwright and `node --test`. Its templates go into
a project's scripts folder, and the project owns them:

- `verify.mjs`, with `--affected` and `--base <ref>`;
- the scope rules, and a guard test that fails when a test reads a file in
  another package with no entry that runs it;
- a machine-wide lock, so only one heavy job runs at a time;
- a record of a pass on a clean tree, so a merge step skips a second run.
