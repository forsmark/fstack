# {{NAME}}

{{PURPOSE}}

Stack: {{STACK}}

## Commands

- `node scripts/verify.mjs --affected` runs the checks and the tests that the changes since origin/main can reach. Run it once, at the end of your work, on a clean tree.
- `node scripts/verify.mjs` runs everything. It runs before a release.
- `node tools/spec-checks/bin/spec-checks verify` runs the spec checks. Run it before you archive a change, and after a merge that touched `openspec/`.
- Heavy jobs wait for one machine-wide lock. Start other heavy commands with `node scripts/heavy-lock.mjs <command>`.

The first OpenSpec change sets up the stack. It adds the lint, typecheck and test commands to CONFIG in `scripts/verify.mjs`, the test runners to `coverage.adapters` in `openspec/checks.json`, and the commands to this list.

## A change to behavior goes through OpenSpec

The specs in `openspec/specs/` say what the system does. A change to what a spec says, or new behavior no spec describes, goes through an OpenSpec change: propose, apply, archive. Load the skill `spec-checks:practice` before each step.

- The owner answers both gates: the proposal gate after propose, and the sync question before archive.
- The base branch is `main`. One change goes in one pull request, from proposal to archive.
- A fix that makes the code do what a spec already says needs no change.

## Issues

The issues are Backlog.md tasks in `backlog/`. Load the skill `backlog:practice` before you file, take, hand out, finish or archive a task.

- Worktrees go in `.claude/worktrees/`, one for each task branch. Git ignores that folder, and Claude Code makes its own worktrees there too.
- A tool that scans the tree from the project root, such as a test runner, a linter or a formatter, skips `.claude/worktrees/`. Then it does not run the worktrees' copies of the code.
- The owner reviews a plan that holds a product, architecture or workflow decision.

## Characters in code

Write an invisible or look-alike character in code as a braced escape, such as `'\u{2028}'`, and in a regex with the `u` flag. The tool call that writes a file can turn a four-digit escape such as `\u2028` into the raw character. After such an edit, `grep -nP '[^\x00-\x7F]' <file>` lists every line that holds a non-ASCII character. Check each one is meant.

## Words

`GLOSSARY.md` holds the domain words, and they are binding. Use its term, never a synonym. A change that brings a new concept adds its term to the glossary in the same change.

Write specs, docs and commit messages in plain English: one idea per sentence, active voice, one name per thing.
