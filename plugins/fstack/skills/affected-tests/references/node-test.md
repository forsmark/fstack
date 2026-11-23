# node --test

The Node.js test runner has no selection by change. It runs the files you name, or the files that its default patterns find. So select by folder: run all the tests of a folder when any file in that folder changed.

Sources:

- https://nodejs.org/api/test.html, "Running tests from the command line" and "Watch mode"
- https://nodejs.org/api/cli.html, `--test`

## How verify.mjs selects

- A workspace package whose `test` script is `node --test` gets the package selection of the workspace tool. See [turborepo.md](turborepo.md).
- The scripts folder is no workspace package, so the workspace tool never runs its tests. affected.mjs sets `scripts` when a file under SCRIPTS_DIR changes, or when EXTRA_TESTS names SCRIPT_TESTS. verify.mjs then runs:

```sh
node --test "scripts/**/*.test.mjs"
```

Quote the glob, so that the shell does not expand it. The docs give that advice too, for portability.

## Its limits

- Without file arguments, `node --test` searches the whole working directory with its default patterns, such as `**/*.test.{cjs,mjs,js}` and `**/test/**/*.{cjs,mjs,js}`. Always pass a glob, or it also runs the tests of every package.
- The folder is the unit. A change to one script runs every script test. Split the folder when that grows slow.
- `node --test --watch` reruns the tests that a change affects, through their imports. The docs mark watch mode as experimental. It runs until you stop it, so it does not fit verify.
- The templates use `import.meta.dirname`, `import.meta.filename` and test globs. Use Node 22 or later. The templates were tested on Node 24.
