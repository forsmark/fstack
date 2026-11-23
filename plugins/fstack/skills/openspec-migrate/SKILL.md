---
name: openspec-migrate
description: Move this repo's OpenSpec skills to OpenSpec 2.1, or show where this repo stands. Temporary. Delete it once the global skills are installed.
argument-hint: "[status]"
disable-model-invocation: true
---

# OpenSpec migrate

This skill moves the repo it runs in from OpenSpec 1.x skills to 2.1 skills that stay in the repo. A repo moves when its owner works on it again. No list of repos exists, and none is needed.

The global skills come last. A skill in `~/.claude/skills/` overrides a project skill with the same name. Installed early, they would replace the 1.x skills of a repo that has not moved yet. For a repo nobody works on any more, that does no harm.

There are two modes:

- `/openspec-migrate status` shows where this repo and the machine stand. It changes nothing.
- `/openspec-migrate` migrates this repo. It deletes files and commits on a branch.

## Status

Run the script and show its output as it prints it:

```bash
node ~/.claude/skills/openspec-migrate/scripts/status.mjs
```

It reads the repo in the current folder. Pass another folder as its argument to read that repo instead. It marks a repo `migrated` when the repo has 2.x skills in `.agents/skills/`, links to them from `.claude/skills/`, and `skillsScope: project`. OpenSpec 2.x skills carry no version line, so the script reads the `.agents/skills/.openspec-target` file that 2.x writes.

It also shows the CLI version and whether the global skills are installed. The owner decides when the last stage starts. Do not start it.

## Migrate one repo

Follow the steps in order. Stop at a failed step and report it.

### 1. Check the start

- `status` does not mark this repo `migrated`. When it does, stop: there is nothing to do.
- The folder is a git repo, and `git status --porcelain` prints nothing. When the tree is not clean, stop. The owner commits or stashes first.
- `openspec --version` prints `2.1.0`. When it prints another version, stop and show the upgrade command: `pnpm add -g @fission-ai/openspec@2.1.0`. The owner runs it.
- Make a branch: `git switch -c chore/openspec-2.1`.

### 2. List what the repo has

Report these four things before you change anything:

1. The version in `generatedBy` of each `.claude/skills/openspec-*/SKILL.md`.
2. Each file in `.claude/commands/opsx/`. OpenSpec 2.0 removed these commands.
3. The repo's own edits to each skill and each command file. Generate a clean copy of the same version in a scratch folder. Give it a scratch home, so the repo does not register on this machine. Copy the machine's OpenSpec config into that home: its `delivery` and `workflows` change the generated text.

   ```bash
   scratch=$(mktemp -d)
   mkdir -p "$scratch/repo" "$scratch/home/.config/openspec"
   cp ~/.config/openspec/config.json "$scratch/home/.config/openspec/"
   cd "$scratch/repo"
   HOME="$scratch/home" npx -y @fission-ai/openspec@<version> init --tools claude
   diff -ru "$scratch/repo/.claude/skills" "<repo>/.claude/skills"
   ```

   When the repo has command files, generate a second clean copy in another scratch folder. Set `"delivery": "both"` in its copy of `config.json`, so OpenSpec writes the commands too. Then diff `.claude/commands/opsx` the same way. Only the command diff counts from this copy: `delivery` also changes the skills' text.

   Every line a diff shows is an edit the repo made. Step 4 overwrites the skills, so each such edit must move first. A repo whose skills have no `generatedBy` line has edits of unknown origin. Report that and ask the owner.
4. Each line in AGENTS.md or CLAUDE.md that names an `/opsx:` command.

### 3. Move each edit

For each edit from step 2, ask the owner where it goes. Offer these places:

- `openspec/config.yaml` under `context`, for facts every OpenSpec step needs.
- `openspec/config.yaml` under `rules`, for a rule on one artifact, such as `specs` or `tasks`.
- `openspec/config.yaml` under `operations`, for guidance on one operation, such as `archive`.
- A skill with a name of its own, for a whole procedure. OpenSpec owns the names that start with `openspec-`, so pick another.
- Nowhere, when the 2.1 skill already does it.

Move each edit where the owner says. Rewrite each `/opsx:<name>` line in AGENTS.md or CLAUDE.md to name the skill instead, such as `openspec-propose`.

### 4. Upgrade the skills

```bash
openspec init --scope project --tools claude --no-animation
```

This replaces the skills with 2.1 copies in `.agents/skills/` and links them from `.claude/skills/`. It does not record the scope. Add this line at the top level of `openspec/config.yaml`, or `openspec update` asks again at each run:

```yaml
skillsScope: project
```

OpenSpec deletes each command file that it generated and that nobody edited. It keeps an edited one, and its output says "Kept … command file". Delete a kept file only after step 3 moved its edits, and say which files you deleted.

### 5. Check the repo

- `openspec validate --specs --strict` passes.
- The repo's own verify command passes, if it has one. AGENTS.md or `package.json` names it.

### 6. Offer the spec checks

Ask the owner whether the repo adopts the spec-checks practice. It is opt-in. When the owner says yes, follow [references/adopt-checks.md](references/adopt-checks.md).

### 7. Commit

Commit on the branch with a message that lists what moved where. Show `git show --stat HEAD`. Do not push.

## The last stage

The owner starts this stage when the repos they still work on are migrated. A repo left on 1.x then uses the global skills in place of its own. The owner runs these steps:

1. Install the global skills from one repo: `openspec init --scope global --tools claude`. In that repo, the command also removes the repo's own skills at once. Commit the removed files there.
2. Run the same command in each other migrated repo, when its owner chooses, and commit the removed files. The global skills already override the repo copies, so this is not urgent. The command refuses to run while an edited `/opsx` command file is left in the repo.
3. Delete this skill from fstack.
