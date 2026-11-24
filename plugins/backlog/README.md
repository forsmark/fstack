# backlog

The working practice for [Backlog.md](https://github.com/MrLesk/Backlog.md)
tasks in this stack, and a hook that keeps a task's plan on the board. A
project that uses it keeps its issues as Markdown files in `backlog/tasks/`,
and the `backlog` CLI changes them. It has two parts:

- The `practice` skill. Claude loads it when it files, takes, hands out,
  finishes or archives a task. You can also start it as `/backlog:practice`.
- A hook that copies an OpenSpec change's `tasks.md` into the plan of the task
  that links the change.

Backlog.md's own guides (`backlog instructions`) tell how to use each command.
The skill adds three things that they leave open:

- **Claims across worktrees.** `backlog task list` reads only the checkout it
  runs in, so the main checkout shows a claimed task as To Do. The skill makes
  a branch named after the task ID, such as `task-12`, the claim. Git creates a
  branch only once, so of two sessions that claim one task, exactly one wins.
  While the branch is open, only that branch changes the task file. That keeps
  the merge free of conflicts. A worker commits its task file at each step, and
  the board shows the progress (see
  [What shows across branches](#what-shows-across-branches)).
- **The link to OpenSpec.** A task that changes behavior carries one OpenSpec
  change, linked by the reference `openspec/changes/<change>`. The task holds
  the why and one to five outcomes as acceptance criteria, plus "the change is
  archived". The change holds the spec, the design and the steps. Each outcome
  is checked as soon as evidence shows it, so the card on the board counts the
  progress.
- **How a task reads.** The rules follow the
  [Linear Method](https://linear.app/method): a plain title, a short why, one
  to five observable criteria, one owner, one task per pull request. Ideas go in
  drafts, and Done or abandoned tasks are archived at the end of each batch.

## The plan hook

OpenSpec's apply step checks off the steps in the change's `tasks.md`, so that
file is the plan. The board and the web view show a task's plan field, and a
path in a reference shows there as plain text. The hook closes that gap.

- **When it runs:** after a Write or an Edit of an open change's `tasks.md`, and
  after a shell command that names a `tasks.md` or a change folder, or that runs
  a git command that can bring another `tasks.md`, such as a merge or a rebase.
  A failed call counts too: `sed … tasks.md && npm test` fails when a test
  fails, after the edit. `git stash`, `reset` and `restore` do not trigger it,
  so it never changes a file in the middle of a stash or a rebase.
- **What it writes:** the change's `tasks.md`, copied into the plan of the task
  that the checkout's branch names: TASK-12 on `task-12`. On any other branch it
  writes nothing, so it never changes the task file of another branch.
- **Where:** the checkout of the edited file, the folder of a leading `cd <dir>`
  or a `git -C <dir>` in the command, or else the call's working directory.
- **When the plan is equal:** it compares the plan in the form Backlog.md
  stores it, with LF line ends and no runs of blank lines, and leaves an equal
  plan alone.
- **What it tells Claude:** after a copy, the full path of the task file that
  changed, so it goes into the next commit. It reports a `backlog` CLI that is
  missing or fails, and a task that links more than one open change. When
  another process holds Backlog.md's lock on the task, it tries again up to
  five times first.

It does nothing in a project without a Backlog.md config or without
`openspec/changes`. An edit outside Claude Code does not trigger it, and the
skill gives the command to copy the plan by hand. A `tasks.md` over about
128 KB is too long for a command argument, so its copy fails.

## Needs

Node 22 or later, git, and the `backlog` CLI 1.57.4:
`npm i -g backlog.md@1.57.4`. The hook reads the CLI's JSON and messages, so
fstack pins one version. `install.sh` warns when the CLI's version differs.
`new-project` sets up Backlog.md in each new project, with the worktrees in
`.claude/worktrees/`, which git ignores. Claude Code makes its own worktrees in
the same folder.

Install the plugin alone with:

```
/plugin install backlog --marketplace forsmark/fstack
```

Run the tests with `cd plugins/backlog && pnpm test`. The end-to-end tests need
the `backlog` CLI on the PATH, or `BACKLOG_BIN` set to it, and skip without it.

## What shows across branches

With `check_active_branches: true`, the default that `backlog init` writes, the
board, `backlog overview` and the web view read the committed task files of the
local branches that had a commit in the last 30 days (`active_branch_days`).
`backlog task list` and `backlog task view` read only the checkout they run
in. A change that a worktree has not committed shows nowhere else. So:

- To see which tasks are taken, list the task branches:
  `git branch --list 'task-*'`.
- A task shows Done on the board as soon as its branch commits Done, before
  the merge. It is in when `backlog task view` in the main checkout shows it
  Done after a pull. That also holds after a squash merge.
- The board and the web view show a claimed task from its branch, but an edit
  made there, such as a status change, writes the main checkout's copy. That
  breaks the one-writer rule, and the merge of the task branch conflicts. Use
  them to read a claimed task. The static `backlog browser export` reads only
  the main checkout, so it shows no branch progress.

Backlog.md plans to share IDs, assignments and status across worktrees in its
task
[BACK-760](https://github.com/MrLesk/Backlog.md/blob/main/backlog/tasks/back-760%20-%20Share-task-IDs-assignment-and-status-across-branches-and-worktrees.md),
through a git ref that every worktree reads. When that lands, the branch claim
can go.
