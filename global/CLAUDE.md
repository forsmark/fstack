# Global instructions

## Questions

Put each question for the user in the pocket with `mcp__pocket__ask`, including a question at the end of a report. Then go on with your default. Ask in the chat only when no work can go on without the answer.

## fstack

fstack holds the source of this setup: the plugins, the skills, the output style and this file. `~/.claude/CLAUDE.md` is a link into the fstack checkout, so `readlink -f ~/.claude/CLAUDE.md` shows where the checkout is. Make each change there. The plugins under `~/.claude/plugins/cache/` are copies of that source. A plugin or a skill picks up a change after `/reload-plugins`.

## Commits

Commit to a GitHub repository with the noreply address `643266+forsmark@users.noreply.github.com`. When `git config user.email` shows another address, set the noreply address in the repository before you commit.

## Stack

The user's stack for new projects is pnpm with turbo, TypeScript 6 and ESLint. A web front end adds React, TanStack Router, TanStack Query and Tailwind CSS. Use this stack wherever a task needs one, such as the Stack question of `/fstack:new-project` or a proposal you answer for the user. Ask the user about each choice it leaves open, such as the test runner or the formatter, and before you choose another stack.
