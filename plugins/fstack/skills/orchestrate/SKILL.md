---
name: orchestrate
description: Plans work across subagents, forks, workflows and the advisor. It covers whether to split at all, how to split by context, each agent's model and effort, the brief, failures and verification. Use before you start two or more agents, before you propose or write a workflow, and when the user asks how to split work across agents.
---

# Orchestrate

An agent you start knows only its brief, and you see only its report. Both handoffs drop detail. This skill decides when that cost pays, and how to keep the loss small.

When another skill hands out the work, such as the backlog practice, follow that skill's steps. This skill then sets the agent and the effort of each piece.

## Terms

- The **orchestrator** is the session that hands out work. It works in the main checkout.
- The **brief** is the prompt an agent gets. It is all the agent knows.
- A **fan-out** is a set of agents of one kind that start together.

## 1. Decide whether to split

One agent with the right tools does most work. Several agents use 3 to 10 times the tokens of one agent on the same task, and they often take longer in total. Parallel agents buy coverage, not speed.

Split only for one of these reasons:

- **Context protection.** A subtask makes much output that you need only in summary, such as a test run, a log or a docs lookup.
- **Parallel paths.** The pieces are independent and share no state, such as separate sources, separate files, or components with a fixed interface.
- **A specialist.** A role needs other tools, or a prompt that conflicts with yours, such as a read-only reviewer.
- **A blackbox check.** Finished work needs a check against criteria by an agent that does not hold its history.

Do the work yourself when it needs back-and-forth with the user, when its phases share context, such as the plan, build and test of one feature, or when a few tool calls do it.

Done when you can name the reason from the list, or you do the work yourself.

## 2. Choose the form

| Form | Use it when | Know this |
| --- | --- | --- |
| Subagent, with the Agent tool | A few pieces, and you decide the next step from each report | Each report enters your context. SendMessage sends an agent a follow-up, and the agent keeps what it learned. At most 20 run at once. |
| Fork | The piece needs this conversation, or you try several approaches from one start | A fork runs on this session's model and effort, and ignores the `effort` parameter. It shares this session's prompt cache. |
| Workflow | Many pieces, such as an audit, a migration, research across many sources, or a cross-check | A script holds the plan and the results, so only the answer enters your context. Read [references/workflows.md](references/workflows.md) first. |
| Advisor | You do the work, and the plan or the result needs a stronger judgement | Only the main session can consult it, and only while the advisor is on, through `/advisor` or the `advisorModel` setting. |

Done when each piece of the work has its form.

## 3. Split by context

Divide the work by the context each piece needs, not by the kind of work. The agent that builds a feature also writes its tests, because it holds the reasons for the code.

Good boundaries:

- independent research paths,
- components with a fixed interface between them,
- a check that needs only the criteria and the result.

Poor boundaries:

- the plan, the build and the tests of one feature as separate agents,
- components that need constant back-and-forth,
- pieces that read and change one shared state.

Give each agent that edits its own files or its own worktree. Two agents never edit one file.

Done when each piece names what it reads and what it writes, and no two pieces write the same file.

## 4. Pick the agent and its effort

| Role | Agent | Model | Effort |
| --- | --- | --- | --- |
| A lookup, a search, or one path of a parallel read | `fstack:reader` | Haiku 5.5 | low |
| One scoped task, such as a change with its tests | `fstack:worker` | the session's | medium |
| One whole task of a batch, such as a backlog task that carries an OpenSpec change | `fstack:worker` | the session's | high, passed on the Agent call |
| A check of finished work, or a verdict on findings | `fstack:verifier` | the session's | high |
| A wide search of an unknown codebase | `Explore` | its own | its own |
| A piece that needs this conversation | a fork | this session's | this session's |

The fstack agents set their own model and effort. For any other agent, pass `effort` on the Agent call.

- Haiku 5.5 costs five times more per token when the prompt of a request passes 100K tokens. A reader at a higher effort makes more tool calls, so its prompt grows faster. Keep the reader at low and give it one narrow question. Split a wide read across several readers.
- When a read needs judgement, such as a choice between two designs, pass `model` on the Agent call to run the reader on a larger model.
- An agent with no model runs on the session's model. Change its effort before you change its model. [references/effort.md](references/effort.md) lists the levels of each model and how Claude Code picks an agent's level.
- An agent at low effort skips searches and checks more often. Give it a checklist. When its work comes back shallow, raise the effort before you add instructions.
- Keep each fan-out uniform: the same agent, model, effort and tools. In a workflow run, a uniform fan-out also shares one prompt cache.
- Raise an agent above `high` only when the user asks for it.

Done when each agent has an agent type, a model and an effort level.

## 5. Write the brief

A brief holds:

1. the goal, and why it matters,
2. what you already know and what you ruled out,
3. the files, docs or URLs to read, by path, not retyped,
4. the scope: what the agent may change, and what it leaves alone,
5. the criteria that end the work, each one checkable,
6. the form of the report: the answer first, evidence as `path:line`, and what was not covered,
7. for an agent that edits: the worktree path, the checks to run, and whether to commit.

For a review or a check, give the work and the criteria, not your conclusion. An agent given a hypothesis tends to confirm it.

For an fstack agent, start from its template in [references/briefs.md](references/briefs.md).

Done when a person without this conversation could do the piece from the brief alone.

## 6. Plan the failures

- One failed agent does not fail the batch. Record its piece as not covered, and go on.
- Check every piece, not only the pieces an agent flagged.
- Redo a piece that fails its check, and check it again. After three failed attempts, report it to the user as not covered.
- Try a large split on a small slice first, such as one folder.
- When the usage-limits plugin is installed, read the usage before a large split.

Done when the plan says what happens when each agent fails.

## 7. Check and report

- Read each report as a claim. Check a fact against its file before you build on it or pass it on. An agent's mistakes read as confident as its findings.
- Before you report work done, give it to `fstack:verifier` with the criteria. Skip this only for a small change, such as a one-line fix or a wording change.
- Tell the user what is done, the evidence, and what is not covered, with the reason.

Done when each piece is checked, redone, or listed as not covered.
