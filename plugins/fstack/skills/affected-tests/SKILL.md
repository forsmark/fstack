---
name: affected-tests
description: Affected tests for repos where agents work in parallel. Each subagent runs only the tests its changes can reach, and the full suite runs once per batch. Use when tests should run for a change in such a repo, and when setting up affected test selection in a project.
---

# Affected tests

Parallel agents that each run the full suite wait on each other and on the machine. So each subagent runs only the tests that its changes can reach. The full suite still runs once per batch, before a release, and it catches what the selection misses.

## Terms

- The **base** is the ref that work merges into, such as `origin/main`.
- The **changes** are the files changed since the merge base with the base: committed, uncommitted and untracked.
- An **affected verify** is `node scripts/verify.mjs --affected`. It runs the checks and the tests that the changes can reach.
- The **affected list** is `node scripts/verify.mjs --affected --list`. It prints each changed file, the rule it matched, and the commands that the affected verify starts. It runs nothing and waits for no lock.
- The **gate**: the affected verify refuses to run until the affected list printed the same list, with the same base, changed files and commands. Every affected verify prints the list again before it starts a command. A full verify has no gate.
- A **full verify** is `node scripts/verify.mjs`. It runs the checks and every test.
- A **batch** is the set of branches that ship together in one release.
- A **heavy job** is a run that loads the machine, such as a verify, an e2e run or a build. Only one heavy job runs at a time on a machine.

A project can name these scripts in another way. Its `AGENTS.md` or `CLAUDE.md` says how.

## Run the tests for a change

1. While you work, run only the test files that you changed or wrote, one at a time, with the runner's own command. Lint and typecheck only the packages that you touched.
2. At the end of your work, bring in a fresh base as the project's practice says, and commit, so the tree is clean. Run the affected list, and read each line. A changed test that no listed command starts needs a run of its own. An e2e spec is such a test, in `e2e/` or in a package, because a package's test command does not start Playwright. [references/playwright.md](references/playwright.md) says how to run e2e. Done when you have the list, and each such test had its run.
3. Run the affected verify once. Done when it exits 0.
4. When it fails, repair the cause, commit, and run the affected verify again. When the repair changed the list, the gate refuses the run. Run the affected list again, read it, then run the affected verify.
5. Report the affected list, each run of its own from step 2, and the last line of the affected verify. That line says whether verify recorded the pass.

When the affected list runs tests instead of printing a list, the project's `verify.mjs` is older than `--list`. Count that run as the affected verify of step 3, and do not run it again. Tell the owner that the templates hold newer copies of four files: `verify.mjs`, `verify/affected.mjs`, `verify/affected.test.mjs` and `verify/record.test.mjs`. The project owns its copies, so the owner merges the new code into all four by hand, and keeps CONFIG and the layout. The tests fail when only the first two change.

A pass on a clean tree leaves a record. A merge step that finds the record skips its own run on the same tree and base.

The full verify belongs to whoever builds the batch. It runs once, on the batch, before the release. A subagent runs the affected verify only.

verify waits for the heavy lock by itself. Start any other heavy command through the lock:

```sh
node scripts/heavy-lock.mjs <command> [arguments]
```

A job inside a job that holds the lock does not wait, so nesting cannot deadlock.

## Scope rules

`scopeOf` in `scripts/verify/affected.mjs` maps each changed file to tests:

- A file in a workspace package runs that package and every package that depends on it.
- A file in the scripts folder runs the script tests. That folder is no workspace package, so the workspace's runner never sees its tests.
- A file that NO_TESTS matches runs nothing. The defaults are docs, e2e and Markdown at the root.
- Any other file, such as the lockfile or a shared config, runs everything.
- An entry in EXTRA_TESTS adds the tests that read a file outside their own package.

The **guard** is `scripts/verify/affected.test.mjs`. It reads the code of each package and each script test for paths that climb out of their folder. It fails when a read has no entry that runs the reader. Repair a guard failure with an EXTRA_TESTS entry, and give the entry a comment that names the test and what it reads.

A file that climbs to the repository root can read anything, and the guard cannot see what. A person reads that file, gives its reads entries, and lists it in READS_THE_WHOLE_REPO.

## Set up a project

1. Find the stack: the workspace tool and each test runner. Read the reference for each:
   - [references/turborepo.md](references/turborepo.md) for turbo or pnpm workspaces.
   - [references/vitest.md](references/vitest.md) for Vitest.
   - [references/playwright.md](references/playwright.md) for Playwright e2e tests.
   - [references/node-test.md](references/node-test.md) for `node --test`.
2. Copy the templates into the project's scripts folder. The project owns the copies, and CI needs nothing from this skill.

   ```sh
   cp -r ${CLAUDE_SKILL_DIR}/templates/. scripts/
   ```

   | File | What it does |
   | --- | --- |
   | `verify.mjs` | Runs the checks and the tests. `--affected` and `--base <ref>` select. `--list` prints what a run starts, and runs nothing. `--affected` runs only after `--list`. |
   | `verify/affected.mjs` | The scope rules, EXTRA_TESTS and READS_THE_WHOLE_REPO. |
   | `verify/reads-across.mjs` | Finds the reads across folders for the guard. |
   | `verify/affected.test.mjs` | Tests the scope rules, and holds the guard. |
   | `verify/record.mjs` | Writes and finds the record of a pass. |
   | `heavy-lock.mjs` | The machine-wide lock. |
   | `*.test.mjs` | The tests of the files above. |

3. Edit CONFIG at the top of `verify.mjs`: the base, the test commands, and the lint and typecheck steps at the lines marked `PROJECT:`.
4. Edit the layout at the top of `verify/affected.mjs`: PACKAGE, SCRIPTS_DIR and NO_TESTS. When you change the layout, change the sample tests in `affected.test.mjs` to match.
5. Run the tests:

   ```sh
   node --test "scripts/**/*.test.mjs"
   ```

   The guard lists each read that lacks an entry. Read each test it names, and add the entry or the READS_THE_WHOLE_REPO line.
6. Add `"verify": "node scripts/verify.mjs"` to the root `package.json`. Make CI run the full verify. CI needs the history down to the merge base.
7. Tell the agents. Add lines like these to the project's `AGENTS.md`:

   ```markdown
   - `node scripts/verify.mjs --affected --list` prints each file changed since origin/main, the rule it matched, and the commands that the affected verify starts. It runs nothing. Run it at the end of your work, and put its list in your report. The affected verify refuses to run until this command printed the same list.
   - `node scripts/verify.mjs --affected` runs the checks and the tests that the changes since origin/main can reach. Run it once, at the end of your work, on a clean tree.
   - `node scripts/verify.mjs` runs everything. It runs once per batch, before a release.
   - Heavy jobs wait for one machine-wide lock. Start other heavy commands with `node scripts/heavy-lock.mjs <command>`.
   ```

8. A merge script can skip its own verify when `findRecord` from `verify/record.mjs` finds a record. The comment at the top of that file shows how. A merge script that runs the affected verify runs the affected list first, as the gate asks.

Done when the tests pass. An affected list for a change in one package names that package. It also names the command that tests the package and its dependents.

## Limits

- The guard reads paths from the text. A path that code builds from variables stays unseen. Review a new test that reads files.
- `heavy-lock.mjs` needs `flock` from util-linux and reads `/proc`. Without `flock` it warns and runs the job with no lock. That is the case on macOS.
- The gate keeps a hash of the last affected list in the file `verify-list` in the git folder of the checkout. Each worktree has its own git folder, so each has its own list, and the tree stays clean.
- The lock and the records live under `~/.cache/<name>/`, where `<name>` is the folder name of the main checkout. `HEAVY_LOCK_FILE` and `VERIFY_RECORDS` set other paths.
- The templates need Node 22 or later and use no packages.
