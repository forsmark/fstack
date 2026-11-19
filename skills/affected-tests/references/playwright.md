# Playwright

Playwright's selection by change cannot see a change to the app under test. An e2e test reaches the app through a browser and a server, not through an import. So e2e keeps a selection of its own, outside `verify --affected`.

Sources:

- https://playwright.dev/docs/test-cli, the options `--only-changed`, `--pass-with-no-tests` and `--last-failed`
- https://playwright.dev/docs/release-notes, version 1.46, "`--only-changed` cli option"

## `--only-changed [ref]`

```sh
npx playwright test --only-changed=origin/main --pass-with-no-tests
```

- It runs the test files that changed between `HEAD` and the ref. Without a ref it covers uncommitted changes.
- The release notes of 1.46 add that it also runs the test files that import a changed file. That covers a changed helper or fixture under the e2e folder.
- It supports git only. Under Bun it does not follow imports.
- Add `--pass-with-no-tests` when a run can select nothing. The docs describe that flag as the way to make such a run succeed.

A change to a page, a route or an API changes no file that a test imports. So `--only-changed` selects nothing for it.

## The selection that e2e keeps

affected.mjs puts `e2e/` in NO_TESTS, so an e2e change alone runs no package tests. Choose e2e tests like this instead:

1. During its work, a subagent runs the e2e folder for the feature it changed, such as `npx playwright test tests/checkout/`.
2. A subagent that edits e2e tests also runs `--only-changed=<merge base>` once, to cover the files it edited.
3. The full e2e suite runs once per batch, before a release, with the full verify.

An e2e run is a heavy job. Start it through `node scripts/heavy-lock.mjs`, or call `holdHeavyLock()` first in the script that starts it.

A project can map app folders to e2e folders, the same way as EXTRA_TESTS. Keep that map in the e2e script, not in affected.mjs, because no guard can read which page a browser test opens.
