# fstack

The plugin that holds the fstack skills. Each skill runs as
`/fstack:<skill>`:

- [humanize](skills/humanize/README.md)
- [affected-tests](skills/affected-tests/README.md)
- [new-project](skills/new-project/README.md)
- [openspec-migrate](skills/openspec-migrate/README.md)

Install it alone with:

```
/plugin install fstack --marketplace forsmark/fstack
```

A skill's own files are under `${CLAUDE_SKILL_DIR}`. new-project copies the
affected-tests templates from `${CLAUDE_PLUGIN_ROOT}/skills/affected-tests/`.
