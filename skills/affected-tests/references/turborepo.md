# Turborepo

Turborepo selects tests by package. It selects a whole package when any file in it changed, and it adds the packages that depend on it. It never selects single test files. Pair it with the runner's own selection inside a package, or let each selected package run all its tests.

Sources:

- https://turborepo.com/docs/reference/run, the options `--filter` and `--affected`
- https://turborepo.com/docs/crafting-your-repository/running-tasks, "Filtering by source control changes"
- https://pnpm.io/filtering, `--filter "[<since>]"`

## The filter that verify.mjs uses

```sh
turbo run test --filter='...[<commit>]'
```

- `[<commit>]` selects the packages with changes since that commit.
- `...` before the selector adds every package that depends on them, however far along the graph.
- Several `--filter` flags form a union. verify.mjs adds one `--filter=<name>` for each package that EXTRA_TESTS names.

verify.mjs passes the merge base with the base ref, not the base ref itself. A plain `[origin/main]` compares with the tip of `origin/main`. When the base moved on after the branch started, the files that the base changed count as changes too, and turbo selects their packages. A test with turbo 2.11.12 showed this: the base changed package `a`, the branch changed package `b`, and `...[main]` selected both.

A plain `[<commit>]` also counts uncommitted and untracked files. The docs do not say this. A test with turbo 2.11.12 showed it for an edited file and for a new file.

## `--affected`

```sh
turbo run test --affected
TURBO_SCM_BASE=origin/release turbo run test --affected
```

- The docs say it equals `--filter=...[main...HEAD]`. The three dots compare with the merge base, so a base that moved on adds nothing.
- `TURBO_SCM_BASE` and `TURBO_SCM_HEAD` change the two ends.
- With `--filter` as well, turbo selects the packages that match both.
- In a checkout that is too shallow to hold the merge base, turbo counts every package as changed. In CI, fetch the full history. The docs name `actions/checkout` with `fetch-depth: 0` and `filter: blob:none`.
- `futureFlags.affectedUsingTaskInputs` selects tasks by their `inputs` globs instead of by package.

verify.mjs uses `--filter` with the merge base, so the same flag works under pnpm without turbo too. `--affected` is a good fit for CI, where the base is fixed.

## Root files

turbo maps a changed file outside every package to the root package, `//`. It does not map it to the workspace packages. A test with turbo 2.11.12 showed this for a new `tsconfig.base.json` and for an edit to the root `package.json`. Only a change to `turbo.json` selected every package.

So the root rule in affected.mjs runs everything for any root file that NO_TESTS does not name. A shared config or the lockfile can change the result of any package's tests.

## What the package graph cannot see

turbo follows the workspace dependencies in each `package.json`. A test that reads a file of a package it does not depend on, such as a font, a SQL file or a config, is not selected when that file changes. EXTRA_TESTS in affected.mjs adds those tests, and the guard in affected.test.mjs finds the reads that lack an entry.

## pnpm without turbo

`pnpm --filter "...[<since>]" test` reads the same syntax. Since pnpm 12.7.0 it compares with the merge base and still counts uncommitted changes, as https://pnpm.io/filtering says. To use it, set `testAll` and `testFiltered` in verify.mjs to `pnpm -r test` and `pnpm --filter <filter> test`.
