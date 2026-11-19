# Adopt the spec checks

The spec-checks plugin holds the practice skill, the `spec-checks` CLI and a hook. All three do nothing in a repo without `openspec/checks.json`. This reference opts one repo in. Do it on the migrate branch, in the same commit or the next one.

The templates are in the plugin's `templates/` folder. Find it with:

```bash
dirname "$(dirname "$(command -v spec-checks)")"
```

## Steps

1. Copy `templates/openspec/checks.json` to the repo's `openspec/checks.json`. Then edit it with the owner:
   - `baseRefs`: the branch that pull requests target, as `origin/main`. List a second ref when a release branch comes first.
   - `coverage.adapters`: one entry per test runner the repo has, with the folders its tests are in. Remove the runners it lacks.
   - `glossary`: the file with the repo's `**Term**:` lines, or `null` when it has none. Only `claims` reads it.
   - `checks`: remove a check the owner does not want yet.
2. Copy the baseline files the config names from `templates/`. Each one starts with a header and no lines.
3. Write today's gaps into the baselines. This is the one branch where a baseline may start with lines:

   ```bash
   spec-checks validate --write
   spec-checks shall --write
   spec-checks repeated --write
   spec-checks coverage --write
   ```

4. Run `spec-checks verify`. It passes now, because every gap is on a baseline. Report the count of each baseline to the owner. From here on, each baseline only shrinks.
5. When the repo uses Playwright, copy `templates/e2e/support/covers.ts` into the repo's e2e support folder.
6. For CI, run `spec-checks vendor`. It copies the CLI to `tools/spec-checks/`. Add the job from `templates/ci/spec-checks.yml` to the repo's workflow, or call `node tools/spec-checks/bin/spec-checks verify` from the repo's own verify command. Exclude `tools/spec-checks/` from the linter and the formatter.
7. Add this line under `context` in `openspec/config.yaml`, so every OpenSpec step knows the practice:

   ```yaml
   context: |
     This repo follows the spec-checks practice: load the skill spec-checks:practice before you propose, apply or archive a change. Run spec-checks verify before you archive.
   ```

   Keep any context lines that are already there.
8. Name the gate reviewers and the base branch in AGENTS.md, if it does not say yet. The practice skill reads them there.
