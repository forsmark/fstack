# Workflows

A workflow is a script that the runtime runs in the background. The script starts the agents, passes results from one to the next, and holds them in its variables. Only the final answer enters your context. A run can resume in the same session after a pause. Sources: [Dynamic workflows](https://code.claude.com/docs/en/workflows) and [Multiagent orchestration](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration).

## When a run fits

A run fits work with many pieces: an audit of many files for one issue, a migration file by file, research across many sources, or a cross-check of many findings. Do one or two pieces yourself, without a run. Every agent in a run uses tokens, so keep runs to the work that needs them.

## Propose before you run

The Workflow tool starts a run only after the user opts in: the user asks for a workflow in their own words, types `ultracode`, has ultracode on, or starts a skill whose steps call the Workflow tool. Without that, propose the run and wait. The proposal holds:

1. the phases, and what each one returns,
2. the agents of each phase: how many, which agent, and the effort,
3. the total agent count, against the size guideline in `/config`,
4. a time limit,
5. what the run does when an agent fails.

Load the `workflow-authoring` skill before you write the script.

## What the script does

- **One agent per item.** Each agent gets one file, one source or one finding.
- **A second pass over every item.** A second agent checks every item, not only the items where the first agent found something, and looks for what the first agent missed.
- **Redo and check again.** An item that fails its check is redone and checked again, up to a fixed count.
- **Failures as data.** One agent that fails does not fail the run. The run lists its item as not covered, and the report names every item not covered.
- **Uniform fan-outs.** The agents of one phase use the same agent, model, effort, tools, output schema and working directory. Then they share one prompt cache.
- **A small slice first.** Run the script on one folder or a narrow question before the whole job.

## Keep a workflow

A run that you will repeat can become a command. In `/workflows`, select the run and press `s`. A plugin ships a workflow as a script in its `workflows/` folder, and the workflow runs as `/<plugin>:<name>`.
