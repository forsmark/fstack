# Effort

Effort sets how many tokens a model spends on a reply: its thinking, its text and its tool calls. Sources: [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) and [Choose an effort level](https://code.claude.com/docs/en/sub-agents#choose-an-effort-level).

## Levels

| Level | Use it for |
| --- | --- |
| `low` | Short, scoped tasks with a checklist, such as a lookup or a search. The cheapest and fastest level. |
| `medium` | Agent work with a clear end, such as a well-specified change. |
| `high` | Review, harder or longer tasks, knowledge work, and strict instruction following. |
| `xhigh` | One long agentic or coding task, of more than about 30 minutes. |
| `max` | The rare task where time and tokens do not matter. It often gains little over `xhigh`. |

At a lower level a model makes fewer tool calls, combines operations, and confirms in fewer words. At a higher level it plans aloud and makes more calls. Effort barely changes the length of a reply, so state the length you want in the brief.

## Models

| Model | Default | Notes |
| --- | --- | --- |
| Opus 5.5 | `medium` | All five levels. Thinking is always on, so effort is the control for depth and cost. |
| Sonnet 5.5 | `high` | `medium` for a well-specified agentic task, `high` for a harder or longer one. |
| Haiku 5.5 | `medium` | `low` for short tool tasks. In a long agent prompt at `low`, it skips a search or a check, or stops early, more often. `high` for knowledge work and strict instruction following. |
| Fable 5.2 | `high` | Most of the gain is already at `high`. |

## How Claude Code picks an agent's level

1. `CLAUDE_CODE_EFFORT_LEVEL`, when it is set.
2. The `effort` parameter of the Agent call.
3. The `effort` field of the agent's definition.
4. The level of the agent that started it, or a level that a skill sets for the turn.
5. `CLAUDE_CODE_SUBAGENT_EFFORT`, when it is set.
6. The session's level, from `/effort` or `--effort`. This applies only to an agent on the session's model.

An agent on another model gets no level from the session. Set `effort` wherever you set a model.

A fork runs at the session's level and ignores the `effort` parameter. `/tasks` shows each running agent's model and effort.
