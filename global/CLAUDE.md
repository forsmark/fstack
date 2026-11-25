# Global instructions

## Questions

Put each question for the user in the pocket with `mcp__pocket__ask`, including a question at the end of a report. Then go on with your default. Ask in the chat only when no work can go on without the answer.

## fstack

fstack holds the source of this setup: the plugins, the skills, the output style and this file. `~/.claude/CLAUDE.md` is a link into the fstack checkout, so `readlink -f ~/.claude/CLAUDE.md` shows where the checkout is. Make each change there. The plugins under `~/.claude/plugins/cache/` are copies of that source. A plugin or a skill picks up a change after `/reload-plugins`.

## Agents

Follow `/fstack:orchestrate` before you start two or more agents, and before you propose a workflow.

Before you report work done, give it to `fstack:verifier` with the criteria, also when you worked alone. For a larger change, such as a new feature or a change across several modules, also run the `code-review` skill at `high` at the same time, after `git add -N` on new files so its diff holds them. The verifier runs the work against the criteria, and the review reads the code around the diff, so each finds what the other misses. Skip both only for a small change, such as a one-line fix or a wording change. Fix what fails, then give it to the verifier again. An agent that another session started skips both, and reports to that session.

Set an effort level for each agent you start. `fstack:reader` runs at low, `fstack:worker` at medium and `fstack:verifier` at high. For any other agent, pass `effort` on the Agent call:

- `low` for a lookup or a search with a checklist,
- `medium` for a scoped task with a clear end,
- `high` for a review, a check of finished work, or a long task.

A fork ignores `effort` and runs at this session's level. Start a fresh agent when the piece does not need this conversation.

## Commits

Commit to a GitHub repository with the noreply address `643266+forsmark@users.noreply.github.com`. When `git config user.email` shows another address, set the noreply address in the repository before you commit.

## Stack

The user's stack for new projects is pnpm with turbo, TypeScript 6 and ESLint. A web front end adds React, TanStack Router, TanStack Query and Tailwind CSS. Use this stack wherever a task needs one, such as the Stack question of `/fstack:new-project` or a proposal you answer for the user. Ask the user about each choice it leaves open, such as the test runner or the formatter, and before you choose another stack.
