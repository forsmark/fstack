---
name: new-project
description: Set up a new project folder with git, AGENTS.md, CLAUDE.md, a glossary, Backlog.md, OpenSpec, the spec checks and affected tests, then make the first commit. No app code and no stack tooling. The first OpenSpec change adds those.
argument-hint: "<name> [folder]"
disable-model-invocation: true
---

# New project

This skill sets up the agent layer of a new project: git, the files agents read, the task backlog, OpenSpec and the checks. It writes no app code and installs no stack. The first OpenSpec change sets up the stack, so that work goes through the practice like any other change.

The result:

```
<project>/
  .git/                     branch main, one commit
  .gitignore
  AGENTS.md                 what the project is, commands, the OpenSpec rule, words
  CLAUDE.md                 @AGENTS.md
  GLOSSARY.md               the domain words, empty at the start
  backlog/config.yml        the Backlog.md config; the tasks come later
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
- `backlog --version` prints `1.57.4`, the version that fstack pins. When the command is missing, give the owner the install command, `npm i -g backlog.md@1.57.4`, and stop. When it prints another version, tell the owner that the backlog plugin is tested with 1.57.4, and go on.
- `command -v spec-checks` finds the CLI. It is on the PATH while the spec-checks plugin is on.
- `claude plugin list` lists `backlog@fstack`. `AGENTS.md` sends agents to its skill. When it is missing, give the owner the install command, `claude plugin install backlog@fstack --scope user`, and stop.

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

### 6. Set up Backlog.md

```bash
backlog init "<name>" --defaults --integration-mode none --include-remote false
```

`--integration-mode none` leaves `AGENTS.md` as it is. Its Issues section already sends agents to the skill `backlog:practice`. `--include-remote false` keeps every backlog command local, with no fetch.

Then add the Definition of Done at the end of `backlog/config.yml`. `backlog config set` refuses this key, so edit the file:

```yaml
definition_of_done:
  - "`node scripts/verify.mjs --affected` passes on a clean tree, after `node scripts/verify.mjs --affected --list`"
```

Git keeps no empty folders, so the commit holds only `backlog/config.yml`. Backlog.md makes the other folders again when it needs them.

### 7. Opt in to the spec checks

The spec-checks templates are in `$(dirname "$(dirname "$(command -v spec-checks)")")/templates`.

1. Copy `templates/openspec/.` into `openspec/`. This adds `checks.json`, the four baselines and the dismissed file. Each one starts with a header and no lines. Keep them empty: a new project has no gaps to list.
2. Copy `templates/e2e/coverage/not-yet.txt` to `e2e/coverage/not-yet.txt`.
3. In `openspec/checks.json`, set `coverage.adapters` to `[]`. The project has no test runner yet. The first change adds one.
4. Run `spec-checks vendor`. It copies the CLI to `tools/spec-checks/`, so verify and CI run it without the plugin.

### 8. Add affected tests

```bash
mkdir -p scripts
cp -r ${CLAUDE_PLUGIN_ROOT}/skills/affected-tests/templates/. scripts/
```

Leave CONFIG in `scripts/verify.mjs` as it is. Do not add the spec checks to `CONFIG.checks`: the template's own end-to-end test runs verify in a copy without `tools/`, and fails on that command. AGENTS.md lists the spec checks as their own command. The first OpenSpec change fills in the lint, typecheck and test commands, because the stack does not exist yet. Until then the full `verify.mjs` stops at the test step.

### 9. Check

These must pass:

```bash
node tools/spec-checks/bin/spec-checks verify
node --test "scripts/**/*.test.mjs"
openspec validate --specs --strict
backlog doctor
```

The spec checks say "no base" until `origin/main` exists. That is expected.

### 10. Commit

```bash
git add -A
git commit -m "Set up the project"
git status --short --ignored
```

The last command shows each file that `.gitignore` hides, on a `!!` line. A file this skill wrote never shows there. When one does, fix the pattern in `.gitignore`, commit again, and report it to the owner, because the template needs the same fix. A file the skill did not write, such as `.DS_Store`, stays ignored.

Show `git show --stat HEAD`.

### 11. Offer a GitHub repository

Ask the owner whether to create a private GitHub repository. Only when the owner says yes:

```bash
gh repo create <name> --private --source . --push
```

Without a remote, the checks compare nothing until one exists.

### 12. Point to the first change

Tell the owner the next step: the first task, which sets up the stack. File it on `main` and claim it as the `backlog:practice` skill says. It carries the first OpenSpec change. That change:

- adds the package manager, the language tooling, the linter, the formatter and the test runner, each set to skip `.claude/worktrees/`;
- fills in CONFIG in `scripts/verify.mjs` and the layout in `scripts/verify/affected.mjs`;
- adds the test runners to `coverage.adapters` in `openspec/checks.json`;
- lists the new commands in `AGENTS.md`.

Done when the folder has one commit, every check in step 9 passes, and the owner knows the first change.
