# openspec-migrate

A temporary skill that moves the repo it runs in to OpenSpec 2.1 skills that
stay in the repo. A repo moves when you work on it again. The skill keeps no
list of repos. Only you start it, because it deletes files and commits.

```
/fstack:openspec-migrate status
/fstack:openspec-migrate
```

`status` shows this repo's skill version and scope, its git state and its
spec-checks opt-in, and the machine's CLI version. `/fstack:openspec-migrate` finds
the repo's own edits to its skills, asks where each one goes, upgrades the
skills, checks the repo and commits on a branch. When the repos you still work
on are migrated, you install the global skills and delete this skill. Global
skills come last, because a skill in `~/.claude/skills/` overrides a project
skill with the same name.

`install.sh` checks that the `openspec` CLI is the pinned version, 2.1.0, and
prints the upgrade command if not. It never runs `openspec init`.
