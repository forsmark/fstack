# Briefs

A fill-in brief for each fstack agent. Sources: [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) and its [published prompts](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents/prompts), [Don't build multi-agents](https://cognition.ai/blog/dont-build-multi-agents), [Why do multi-agent LLM systems fail?](https://arxiv.org/abs/2503.13657), [Claude Code best practices](https://code.claude.com/docs/en/best-practices), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup) and [Prompting Claude Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5).

An fstack agent starts with its own prompt, which holds its role, its rules and the order of its report. It also loads every CLAUDE.md level, the project's AGENTS.md included, and the git status. It does not see this conversation, the skills you loaded or the files you read. So a brief holds only the task. Name files and commands by path or by their place in AGENTS.md, and do not retype them.

## Rules for every brief

- Give each agent one objective. In a fan-out, give each agent a part that no other agent covers, and name what the others cover. Vague briefs make agents repeat each other's work and leave gaps.
- Say when the work is done. Agents that do not know when to stop are one of the most common causes of failure: they run long, or they stop early.
- Name the decisions already made, such as an interface, a name or the chosen approach. Agents that cannot see each other's decisions make conflicting ones.
- Ask for the obstacles in the report: workarounds, commands that needed extra flags, and quirks of the environment. Then the next agent does not find them again.

## Reader

```
Question: <one question>
Why: <what you will do with the answer>
Known: <what you know, and what you ruled out>
Look in: <paths, docs or URLs to start from>
Leave to others: <what another reader covers>          (fan-out only)
Checklist:
- <an item the answer must cover>
Done when: each checklist item has an answer with its path:line or URL, or "not found".
Answer form: <a list, a table, or one line for each item>
Today's date: <date>                                    (web lookups only)
Budget: about <n> tool calls                            (optional, for an open question)
```

Haiku 5.5 searches less often when it does not know today's date.

## Worker

```
Result: <what is true when the task is done, in one sentence>
Why: <what it is for>
Worktree: <path>, branch <branch>
Read first: <task file, spec or design, related code, by path>
Decisions made: <interfaces, names and the approach that other pieces rely on>
Change: <paths or modules>
Leave alone: <paths, interfaces, dependencies>
Done when:
1. <an observable result>
2. <a failure case that behaves right, such as bad input that is refused>
3. <the checks pass, such as the affected verify in AGENTS.md, with the affected list in the report>
Commit: <yes, and the message style> | no
```

## Verifier

```
Work: <the diff range, the branch, the files, or the list of findings>
Criteria:
1. The work does what the task asked: <the objective, in the words of the task>
2. <a criterion, in the words of the task or the spec>
Read: <the task file or the spec, by path>
Full check: <the command that runs every check, such as the full verify in AGENTS.md>
Report: gaps that affect correctness. Skip style and preference.
```

- Give the verifier no conclusion of yours, and no account of how the work was built. A verifier that gets a hypothesis tends to confirm it.
- Put the objective first. Verifiers often check only shallow things, such as whether the code compiles. A check of the objective catches more failures.
- Keep the line that skips style. A reviewer that is asked to find problems always finds some, and fixing every one adds code that nothing needs.
