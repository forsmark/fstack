# Vitest

Vitest selects test files inside one project. It follows the import graph from each test file and runs the tests that import a changed file. It does not know other packages, so a workspace still needs package selection on top, such as turbo's filter.

Sources:

- https://vitest.dev/guide/cli, the options `--changed`, `--since-last-run` and the command `vitest related`
- https://vitest.dev/config/changed
- https://vitest.dev/guide/recipes/affected-tests, "Running Only Affected Tests"
- `packages/vitest/src/node/vcs/git.ts` in the vitest repository, for the git commands it runs

## `--changed <ref>`

```sh
vitest run --changed origin/main
```

- Vitest runs `git diff <ref>...HEAD`, so it compares with the merge base. It adds staged files, modified files and untracked files.
- Without a value, `--changed` covers only uncommitted changes. Right after a commit it selects nothing.
- A change to a file that every test in the project loads runs every test of the project. The docs name setup files, global setup, a custom environment, `.env` files and the config file with all it imports. `forceRerunTriggers` adds more. By default it holds the config file and `package.json`.
- When no test is affected, Vitest prints "No affected test files found" and exits 0. Vitest 5.1.0 showed this.

## Where it fits

Use `--changed` while you work in one package, for quick feedback:

```sh
pnpm --filter <package> exec vitest run --changed origin/main
```

Keep it out of verify.mjs. There, each selected package runs all its tests. A package that EXTRA_TESTS adds is there because one of its tests reads a file of another package. Vitest cannot see that read, so `--changed` would select none of that package's tests.

## Its limits

- The graph holds imports only. A test that reads a file with `readFileSync` or `fetch` is not linked to that file. Vitest 5.1.0 showed this: a change to a text file that a test read selected no test. EXTRA_TESTS and the guard cover those reads at the package level only.
- A dynamic `import(path)` built from a variable is not in the graph. The docs say so for `vitest related`.
- A dependent package sees a change in another package only when its import resolves to the source file that changed. When the import resolves to built output, such as `dist/`, the changed source file is not in the graph, and the dependent's tests do not run.
- Files passed to `toMatchFileSnapshot` are not tracked.

Each limit is a reason to keep the full suite once per batch.

## `--since-last-run`

Vitest 5.1.0 added `--since-last-run`. It records the files each test loaded and reruns a test when one of those files is newer than the test's last run. Git takes no part. It fits a loop of edits inside one session. It does not fit verify, because its baseline is the last run on this machine, not the base ref. A fresh worktree has no records, so its first run is a full run.
