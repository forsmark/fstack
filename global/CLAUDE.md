# Global instructions

## Questions

Put each question for the user in the pocket with `mcp__pocket__ask`, including a question at the end of a report. Then go on with your default. Ask in the chat only when no work can go on without the answer.

## fstack

fstack holds the source of this setup: the plugins, the skills, the output style and this file. `~/.claude/CLAUDE.md` is a link into the fstack checkout, so `readlink -f ~/.claude/CLAUDE.md` shows where the checkout is. Make each change there. A plugin or a skill picks up a change after `/reload-plugins`.

## Agents

Follow `/fstack:orchestrate` before you start two or more agents, and before you propose a workflow.

Before you report work done, give it to `fstack:verifier` with the criteria, also when you worked alone. For a larger change, such as a new feature or a change across several modules, also run the `code-review` skill at `high` at the same time, after `git add -N` on new files so its diff holds them. The verifier runs the work against the criteria, and the review reads the code around the diff, so each finds what the other misses. Skip both only for a small change, such as a one-line fix or a wording change. An agent that another session started skips both, and reports to that session.

Fix what fails. Then give the verifier one re-check that holds only the failed criteria and your fixes. A fix to wording or a comment needs no re-check. The review runs in the first round only. After the re-check, fix what still fails with no third check. Name in your report each criterion that no check passed.

Set an effort level for each agent you start. `fstack:reader` runs at low. `fstack:worker` and `fstack:verifier` run at medium. For a whole task of a batch, such as a backlog task, pass `effort: high` on its Agent call. For any other agent, pass `effort` on the Agent call:

- `low` for a lookup or a search with a checklist,
- `medium` for a scoped task with a clear end,
- `high` for a review or a long task.

A fork ignores `effort` and runs at this session's level. Start a fresh agent when the piece does not need this conversation.

## Finish a round

Before you report an implementation round done, remove what the round left behind. Remove only what you or your agents made in this round:

- Scratch files in the checkout and in the session's scratchpad, such as debug scripts, logs and screenshots. Delete each one by name, and keep the files your report names. Delete them before the verifier and the review run, so `git add -N` adds none to the diff. Delete them again before the report.
- Worktrees and local branches, once their work is in the base, including those that an agent with worktree isolation left. Run `git worktree remove <path>`, then `git branch -d <branch>`. When `-d` refuses a branch as not merged, keep it and name it in the report.

A branch or a worktree that another session made is a claim, and so is an open task branch of the backlog practice. Leave it, and follow the backlog skill for task branches.

Done when `git status --ignored`, `git branch` and `git worktree list` show nothing from this round except the change and what your report names. The scratchpad holds no file from this round except the files your report names.

## Commits

Commit to a GitHub repository with the noreply address `643266+forsmark@users.noreply.github.com`. When `git config user.email` shows another address, set the noreply address in the repository before you commit.

## Stack

The user's stack for new projects is pnpm with turbo, TypeScript 6, ESLint and Prettier. A web front end adds React, TanStack Router, TanStack Query, Tailwind CSS, and Motion for animation. Motion is the library once named Framer Motion. Its package is now `motion`. Use this stack wherever a task needs one, such as the Stack question of `/fstack:new-project` or a proposal you answer for the user. Ask the user about each choice it leaves open, such as the test runner, and before you choose another stack.
