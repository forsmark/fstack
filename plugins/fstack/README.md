# fstack

The plugin that holds the fstack skills. Each skill runs as
`/fstack:<skill>`:

- [humanize](skills/humanize/README.md)
- [affected-tests](skills/affected-tests/README.md)
- [new-project](skills/new-project/README.md)
- [orchestrate](skills/orchestrate/README.md)
- [openspec-migrate](skills/openspec-migrate/README.md)

It also holds three agents, which the orchestrate skill hands work to. The
reader runs on Haiku 5.5. The worker and the verifier run on Opus, whatever
model the session runs on. Each agent sets its own effort level:

- `fstack:reader`, low: reads and reports, and changes nothing.
- `fstack:worker`, medium: does one scoped task, such as a change with its tests.
- `fstack:verifier`, medium: checks finished work against criteria, and changes nothing.

Install it alone with:

```
/plugin install fstack --marketplace forsmark/fstack
```

A skill's own files are under `${CLAUDE_SKILL_DIR}`. new-project copies the
affected-tests templates from `${CLAUDE_PLUGIN_ROOT}/skills/affected-tests/`.
