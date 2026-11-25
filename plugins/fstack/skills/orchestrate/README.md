# orchestrate

Plans work across agents: subagents, forks, workflows and the advisor.
Claude loads it before it starts two or more agents or proposes a workflow.
You can also start it as `/fstack:orchestrate`.

The skill decides whether to split the work at all. Several agents use 3 to
10 times the tokens of one agent on the same task, so the skill splits only
for one of four reasons: to keep verbose output out of the main context, to
run independent paths in parallel, to give a role its own tools, or to check
finished work without its history. Then it splits by the context each piece
needs, picks an agent and an effort level for each piece, writes the briefs,
and plans what happens when an agent fails.

It works with the three agents of the fstack plugin:

| Agent | Model | Effort | What it does |
| --- | --- | --- | --- |
| `fstack:reader` | Haiku 5.5 | low | Reads and reports, with paths and lines. Changes nothing. |
| `fstack:worker` | the session's | medium | Does one scoped task, such as a change with its tests. |
| `fstack:verifier` | the session's | high | Checks finished work against criteria, and judges findings. Changes nothing. |

Each agent has its own tools and prompt.

## Files

- `SKILL.md`: the steps.
- `references/effort.md`: the effort levels, the defaults of each model, and
  how Claude Code picks an agent's level.
- `references/workflows.md`: when a workflow run fits, what a proposal holds,
  and what the script does.
- `references/briefs.md`: a fill-in brief for each fstack agent, and the
  rules behind them.

## Sources

- [Multiagent orchestration](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration)
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Why do multi-agent LLM systems fail?](https://arxiv.org/abs/2503.13657)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and
  [workflows](https://code.claude.com/docs/en/workflows)
