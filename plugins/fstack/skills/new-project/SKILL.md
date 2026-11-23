---
name: new-project
description: Set up a new project folder with git, AGENTS.md, CLAUDE.md, a glossary, OpenSpec, the spec checks and affected tests, then make the first commit. No app code and no stack tooling. The first OpenSpec change adds those.
argument-hint: "<name> [folder]"
disable-model-invocation: true
---

# New project

This skill sets up the agent layer of a new project: git, the files agents read, OpenSpec and the checks. It writes no app code and installs no stack. The first OpenSpec change sets up the stack, so that work goes through the practice like any other change.

The result:

```
<project>/
  .git/                     branch main, one commit
  .gitignore
  AGENTS.md                 what the project is, commands, the OpenSpec rule, words
  CLAUDE.md                 @AGENTS.md
  GLOSSARY.md               the domain words, empty at the start
  openspec/                 config.yaml, specs/, changes/, checks.json, the baselines
  e2e/coverage/not-yet.txt  the coverage map's list, empty
  scripts/                  verify.mjs, verify/, heavy-lock.mjs, from affected-tests
  tools/spec-checks/        the vendored spec-checks CLI
  .agents/skills/, .claude/skills/   OpenSpec skills, only while no global skills exist
```

## Steps

Follow the steps in order. Stop at a failed step and report it.

### 1. Ask

Ask the owner for these in one message. Offer a default where one is shown:

- **Name.** Default: the argument.
- **Folder.** Default: `~/dev/<name>`.
- **Purpose.** One or two sentences: what the project does, and for whom.
- **Stack.** The languages, runtime and main libraries, as one line. The skill only records it. Default: "not chosen yet".
- **First domain words**, if the owner has some. Each one is a term and one sentence.

### 2. Check the start

- The folder does not exist, or it is empty. When it holds files, stop and ask. Never write into a folder that holds files.
- `openspec --version` prints `2.1.0` or later.
- `command -v spec-checks` finds the CLI. It is on the PATH while the spec-checks plugin is on.

### 3. Make the repo

```bash
mkdir -p <folder> && cd <folder>
git init -b main
```

Copy `${CLAUDE_SKILL_DIR}/templates/gitignore` to `.gitignore`.

### 4. Set up OpenSpec

When `~/.agents/skills/openspec-propose` exists, the global OpenSpec skills are installed. Then run:

```bash
openspec init --scope global --tools claude --no-animation .
```

Otherwise the project keeps its own copy of the skills:

```bash
openspec init --scope project --tools claude --no-animation .
```

With the project scope, add `skillsScope: project` at the top level of `openspec/config.yaml`. `init` does not write it, and `openspec update` asks again at each run without it.

Then add a `context` block to `openspec/config.yaml`. Keep the comments that `init` wrote. Fill in the owner's answers:

```yaml
context: |
  <Purpose>
  Stack: <stack>
  Domain words live in GLOSSARY.md at the repo root and are binding. Use those terms in code, specs and change names.
  This repo follows the spec-checks practice: load the skill spec-checks:practice before you propose, apply or archive a change.
```

### 5. Write the agent files

Copy `AGENTS.md`, `CLAUDE.md` and `GLOSSARY.md` from `${CLAUDE_SKILL_DIR}/templates/` to the project root. In `AGENTS.md`, replace `{{NAME}}`, `{{PURPOSE}}` and `{{STACK}}` with the owner's answers.

When the owner gave domain words, add each one to `GLOSSARY.md` as a line `**Term**:` and its definition on the next line. Leave the rest of the file as it is.

### 6. Opt in to the spec checks

The spec-checks templates are in `$(dirname "$(dirname "$(command -v spec-checks)")")/templates`.

1. Copy `templates/openspec/.` into `openspec/`. This adds `checks.json`, the four baselines and the dismissed file. Each one starts with a header and no lines. Keep them empty: a new project has no gaps to list.
2. Copy `templates/e2e/coverage/not-yet.txt` to `e2e/coverage/not-yet.txt`.
3. In `openspec/checks.json`, set `coverage.adapters` to `[]`. The project has no test runner yet. The first change adds one.
4. Run `spec-checks vendor`. It copies the CLI to `tools/spec-checks/`, so verify and CI run it without the plugin.

### 7. Add affected tests

```bash
mkdir -p scripts
cp -r ${CLAUDE_PLUGIN_ROOT}/skills/affected-tests/templates/. scripts/
```

Leave CONFIG in `scripts/verify.mjs` as it is. Do not add the spec checks to `CONFIG.checks`: the template's own end-to-end test runs verify in a copy without `tools/`, and fails on that command. AGENTS.md lists the spec checks as their own command. The first OpenSpec change fills in the lint, typecheck and test commands, because the stack does not exist yet. Until then the full `verify.mjs` stops at the test step.

### 8. Check

These must pass:

```bash
node tools/spec-checks/bin/spec-checks verify
node --test "scripts/**/*.test.mjs"
openspec validate --specs --strict
```

The spec checks say "no base" until `origin/main` exists. That is expected.

### 9. Commit

```bash
git add -A
git commit -m "Set up the project"
```

Show `git show --stat HEAD`.

### 10. Offer a GitHub repository

Ask the owner whether to create a private GitHub repository. Only when the owner says yes:

```bash
gh repo create <name> --private --source . --push
```

Without a remote, the checks compare nothing until one exists.

### 11. Point to the first change

Tell the owner the next step: propose the first OpenSpec change, which sets up the stack. That change:

- adds the package manager, the language tooling, the linter, the formatter and the test runner;
- fills in CONFIG in `scripts/verify.mjs` and the layout in `scripts/verify/affected.mjs`;
- adds the test runners to `coverage.adapters` in `openspec/checks.json`;
- lists the new commands in `AGENTS.md`.

Done when the folder has one commit, every check in step 8 passes, and the owner knows the first change.
