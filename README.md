# fstack

Forsmark's Claude Code setup: plugins, skills, an output style and global
instructions. The repository is also a plugin marketplace named `fstack`.

- [Layout](#layout)
- [Install](#install)
- [Plugins](#plugins)
- [Skills](#skills)
- [Output styles](#output-styles)
- [Global instructions](#global-instructions)
- [Add to the stack](#add-to-the-stack)
- [For agents](#for-agents)

## Layout

```
plugins/        plugins, installed from the fstack marketplace
skills/         skills, linked into ~/.claude/skills/
output-styles/  output styles, linked into ~/.claude/output-styles/
global/         CLAUDE.md, linked to ~/.claude/CLAUDE.md
install.sh      links and installs all of the above
```

Each plugin and skill has a README in its own folder.

## Install

```
git clone https://github.com/forsmark/fstack.git ~/dev/fstack
~/dev/fstack/install.sh
```

The script links each skill, output style and the global `CLAUDE.md` into
`~/.claude/`. A file in the way moves to `<name>.bak.<time>`. The script then
adds the folder as the `fstack` marketplace and installs every plugin at user
scope. It also checks the `openspec` CLI version. Run it again after you add a
skill or a plugin. What is in place stays as it is.

Skills, output styles and `CLAUDE.md` are links, so an edit to them applies
at once. A plugin picks up an edit after `/reload-plugins`.

To install one plugin from GitHub, without a checkout:

```
/plugin install cache-warmer --marketplace forsmark/fstack
```

## Plugins

| Plugin | What it does |
| --- | --- |
| [cache-warmer](plugins/cache-warmer/README.md) | Keeps an idle session's 1-hour prompt cache warm with a cheap ping before it expires. |
| [email-guard](plugins/email-guard/README.md) | Blocks a tool call that would put a personal email address into a request header. |
| [usage-limits](plugins/usage-limits/README.md) | Reads the 5-hour and weekly usage windows, and tells Claude to write a handoff at 90%. |
| [pocket](plugins/pocket/README.md) | Holds Claude's questions while you are away, so it can keep working. You answer when you are ready. |
| [image-preview](plugins/image-preview/README.md) | Shows a preview of an image in the transcript. |
| [ketch-first](plugins/ketch-first/README.md) | Answers WebSearch and WebFetch with the `ketch` CLI when it is installed. The built-in tool runs when ketch fails. |
| [spec-checks](plugins/spec-checks/README.md) | An OpenSpec working practice and the checks that hold specs to it, for projects that opt in. |

## Skills

| Skill | What it does |
| --- | --- |
| [humanize](skills/humanize/README.md) | Audits or rewrites copy that people read, for writing that sounds machine-made. |
| [affected-tests](skills/affected-tests/README.md) | Each subagent runs only the tests its changes can reach. The full suite runs once per batch. |
| [new-project](skills/new-project/README.md) | Sets up a new project: git, AGENTS.md, a glossary, OpenSpec, the spec checks and affected tests. |
| [openspec-migrate](skills/openspec-migrate/README.md) | Temporary. Moves one repo to OpenSpec 2.1 skills. |

## Output styles

[simple-technical](output-styles/simple-technical.md) makes Claude write
plain prose with one meaning. It follows the sentence rules of ASD-STE100
Simplified Technical English. Pick it with `/output-style`.

## Global instructions

[global/CLAUDE.md](global/CLAUDE.md) is linked to `~/.claude/CLAUDE.md`, which
every session loads. It holds no rules at the moment. The ketch rules moved to
the ketch-first plugin.

## Add to the stack

- A plugin goes in `plugins/<name>/`, with a README and an entry in
  `.claude-plugin/marketplace.json`.
- A skill goes in `skills/<name>/`, with a `SKILL.md` and a README.
- An output style goes in `output-styles/<name>.md`.

Then run `install.sh`.

## For agents

This section is for a Claude Code session that a user points at this
repository with a request such as "I want this". Read it before you install
anything.

### Do not run install.sh as is

`install.sh` installs everything, and it is personal to the owner:

- It replaces the user's `~/.claude/CLAUDE.md` with a link to
  `global/CLAUDE.md`. The old file moves to `CLAUDE.md.bak.<time>`.
- It installs every plugin, including the mods, which need a Claude Code build that loads mods.
- It warns when the `openspec` CLI is not version 2.1.0.

Ask the user which parts they want. Then install those parts one by one, as
the steps below show.

### What each part needs

| Part | Needs | Change before you install |
| --- | --- | --- |
| Mods: cache-warmer, email-guard, usage-limits, pocket, image-preview, ketch-first | A Claude Code build that loads mods. A mod is a plugin whose `hooks/hooks.json` names TypeScript modules under `"modules"`. | email-guard: put the user's addresses in `~/.config/email-guard/emails`, one per line. Without the file it guards the global git `user.email`. ketch-first: nothing. It does nothing without `ketch`. |
| spec-checks | Node 22 or later, the `openspec` CLI 2.1.0, git. The coverage check loads `typescript` from the project. | None |
| humanize | Nothing | None |
| affected-tests | Node 22 or later. The heavy lock needs `flock`, so it is Linux only. | None |
| new-project | The spec-checks plugin, the affected-tests skill, the `openspec` CLI. `gh` only to create a GitHub repository. | None |
| openspec-migrate | The `openspec` CLI 2.1.0. | Temporary and personal. Skip it. |
| simple-technical | Nothing | None |
| global/CLAUDE.md | Nothing | Empty at the moment. Skip it. |

### Install one part

Clone the repository first. Use a path the user chooses, such as `~/dev/fstack`.

A skill:

```bash
ln -s ~/dev/fstack/skills/<name> ~/.claude/skills/<name>
```

An output style:

```bash
ln -s ~/dev/fstack/output-styles/<name>.md ~/.claude/output-styles/<name>.md
```

A plugin:

```bash
claude plugin marketplace add ~/dev/fstack
claude plugin install <name>@fstack --scope user
```

After a plugin install, the user runs `/reload-plugins` or starts a new
session.

### Check the result

- A skill shows in `/skills`, or the user can start it as `/<name>`.
- A plugin shows in `claude plugin list` as `<name>@fstack`.
- For spec-checks: `spec-checks --help` prints its commands in a new session.
  The plugin's `bin/` folder is on the Bash PATH only inside Claude Code.
- For spec-checks development: `cd plugins/spec-checks && pnpm install && pnpm test`.
