---
name: practice
description: The Backlog.md practice of this stack. A task branch claims a task across git worktrees, a task can carry an OpenSpec change whose tasks.md becomes its plan, and tasks stay short. Use in a project that has a backlog folder, when you file, take, hand out, resume, finish or archive a task.
---

# Backlog practice

The issues of a project are Backlog.md tasks, one Markdown file each in `backlog/tasks/`. The `backlog` CLI changes them. Backlog.md's own guides tell how to use each command. Read a guide when you reach its step:

- `backlog instructions task-creation` before you file or split a task,
- `backlog instructions task-execution` before you plan or build a task,
- `backlog instructions task-finalization` before you check criteria or set a task Done.

This skill adds the rules the guides leave open: the claim across worktrees, the link to OpenSpec with its plan, and how a task reads. Where a guide and this skill differ, follow this skill.

## Terms

- The **base** is the branch that work merges into, such as `main`.
- The **orchestrator** is the session that hands tasks to subagents. It works in the main checkout.
- A **worker** is a subagent that does one task in its own worktree.
- A **task branch** is the branch named after a task ID in lower case, such as `task-12`, or `task-12.1` for a subtask. The examples use the default prefix `task`. A project can set another in `task_prefix` in `backlog/config.yml`.
- A task is **claimed** while its task branch exists.

## Why a branch is the claim

Backlog.md reads tasks from more than one place:

- `backlog task list` and `backlog task view` read only the checkout they run in. In the main checkout, a claimed task reads To Do until its branch merges.
- The board, `backlog overview` and the web view also read the commits of the local task branches. They show a task's status, plan and checks as soon as its branch commits them.
- Changes that a worktree has not committed show nowhere else.

So no Backlog.md view tells who holds a task at the moment it is taken. Git does. A branch name exists once in a repository, and git refuses to create a branch that exists. Of two sessions that claim one task, exactly one gets the branch.

The same fact sets the **one-writer rule**: while a task branch is open, only that branch changes the task file. A second branch that edits the same task file, the base included, conflicts at the merge. The plan hook keeps to this rule: it writes only the task that the current branch names.

The board and the web view show a claimed task from its branch, but a change made there writes the main checkout's copy. Read a claimed task there, and change it with `backlog` in its worktree.

## Write a task

- **Title**: the task in plain words, short enough to scan in a list: "Reword the login errors".
- **Description**: why the work matters, in a few sentences. Quote the user or the bug report word for word, and add the link to the source with `--ref`.
- **Acceptance criteria**: one to five results that a person or a test can observe.
- **Size**: one task is one task branch, one pull request and one context window. Split larger work into subtasks with `-p <parent>`, or put the tasks under one milestone.
- **Owner**: one assignee.

When you file work for someone else, state the problem and leave the solution open. The session that takes the task rewrites it as a task before it writes the plan.

An idea or a request that no one has decided to do is a draft: `backlog draft create`. The board holds decided work only.

The orchestrator, or the owner, files tasks and drafts on the base and commits them before it hands tasks out. Then the hand-out reads one list, and each worktree starts from a commit that holds its task. A worker reports follow-up work in its final report, and the orchestrator files it.

## Link an OpenSpec change

Decide whether the task carries an OpenSpec change, as the `spec-checks:practice` skill says. When it does, the task holds the why and the acceptance, and the change holds the spec, the design and the steps. A task carries one change, and one pull request carries the change from proposal to archive, as the project's `AGENTS.md` states.

- Link the change: `backlog task edit <ID> --add-ref openspec/changes/<change>`.
- Name the task ID in the proposal's Why section.
- Write the acceptance criteria when the proposal is written:
  - one to five **outcomes** in plain words, one for each result a person can see when the change is in, such as "The login form names the field that is wrong". They sum up the scenarios of the delta specs for a reader of the board. The scenarios stay the detailed acceptance.
  - a last criterion: "The OpenSpec change <change> is archived", such as "The OpenSpec change login-copy is archived".

The change's `tasks.md` is the plan. Edit that file and leave the task's plan to the plugin's hook. On a task branch, after each tool call that changes `tasks.md`, adds the link or runs a git command that can bring another `tasks.md`, the hook copies `tasks.md` into the plan of the branch's task. When it copies, it tells you that the task file changed. Commit that file with your next commit.

After an edit outside Claude Code, copy the plan by hand, in the worktree:

```bash
backlog task edit <ID> --plan "$(cat openspec/changes/<change>/tasks.md)"
```

When the change is archived, replace the link with the archived path: `--remove-ref openspec/changes/<change> --add-ref openspec/changes/archive/<date>-<change>`. The hook copies only the plan of an open change, so the plan stays as it was at the archive.

## Hand out tasks

The orchestrator does these steps in the main checkout. It makes every worktree itself, so a worker that stops at a gate can be resumed in the same folder.

1. Find the free tasks. `backlog task list -s "To Do" --ready --json` lists the tasks whose dependencies are all Done. Skip a task that has subtasks, and hand out its subtasks instead. A ready task is free when `git branch --list 'task-*'` shows no task branch for it.
2. Claim each task, then make its worktree:

   ```bash
   git branch task-12 <base>
   git worktree add <worktree folder>/task-12 task-12
   ```

   The first command is the claim. When git says that the branch already exists, or that it cannot lock the ref, another session holds the task. Take the next free task. When the second command fails, the claim is still yours: fix the cause, such as a folder in the way, and run it again.
3. Start one worker for each worktree, without the harness's worktree isolation. Give it the task ID, the worktree path, a name for the assignee field, such as `@worker-12`, and the name of this skill.

Done when each worker has a claimed task, its worktree, and a prompt that names all three.

A session that works alone claims with `git switch -c task-12 <base>` and works in its own checkout.

## Resume a task

A worker stops before the task is Done at each owner gate of the spec-checks practice, and when it fails. Its task branch and worktree stay, so the task stays claimed. To go on, the orchestrator starts a new worker in the same worktree, with the task ID, the worktree path, the assignee name and the owner's answer. The new worker goes on at the step it reached.

To tell a stalled claim from a live one, read `git worktree list` for the worktree of each task branch and `git log -1 --format=%cr task-12` for its last commit. Ask the owner before you delete a task branch that another session made.

## Do a task

The worker does these steps in its worktree. A subagent's shell can go back to the main checkout between calls, so start each shell command with `cd <worktree> &&`. Then each `backlog` command changes the task on your branch, and the hook finds your branch.

1. Mark the start: `backlog task edit <ID> -s "In Progress" -a @<assignee name>`. Commit the task file. The board then shows the task In Progress.
2. Follow `backlog instructions task-execution`. When the task carries an OpenSpec change, the owner answers the proposal gate and the sync question before archive. At each gate, commit and push your work, report the question, and stop. Work that falls outside the acceptance criteria goes into your final report as follow-up work.
3. Check each outcome criterion as soon as evidence shows it, such as a test that passes or a run that you watched: `backlog task edit <ID> --check-ac <n>`. Commit the task file with the work of each step, so the board counts the progress. Backlog.md's guide checks criteria only at the end, and this rule replaces that.
4. Follow `backlog instructions task-finalization`. Check the criteria that are left against evidence, write the final summary and set the task Done. The review of the pull request is the user review that the guide asks for.
5. Commit the task file with the last code.

Done when the task is Done on the task branch and `git status` shows a clean tree.

## After the merge

The board shows a task Done as soon as its branch commits Done, before the merge. A task is in when the base's own copy shows it Done. That test also holds after a squash merge, which git does not count as merged.

The orchestrator releases each claim in the main checkout:

1. Pull the base, so its copy holds the merges.
2. For each task branch, run `backlog task view <ID>`. When it shows Done, remove the worktree, then delete the branch:

   ```bash
   git worktree remove <worktree folder>/task-12
   git branch -D task-12
   ```

When the last subtask of a parent task is in, the orchestrator sets the parent Done on the base. No branch holds the parent, so the base is its one writer.

When work on a task stops for good, remove its worktree and delete its task branch with the same two commands. The board then shows the base's copy again, with the status To Do.

## Keep the backlog small

At the end of each batch, after the claims are released, the orchestrator cleans the board on the base. It archives only tasks that have no task branch, so no branch holds a file that the archive moves.

- Archive each task that `backlog task list -s Done` lists in the main checkout. That list reads the base's copy, so it holds the tasks that are in. Run `backlog task archive <ID>` for each. The `backlog cleanup` command needs an interactive terminal, so archive one task at a time.
- Archive each To Do task that no one will do. First add a comment that says why. A request that matters comes back.

## What the project states

The project's `AGENTS.md` states the base, the worktree folder and who reviews a plan. Ask when it does not say.
