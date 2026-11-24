# new-project

Sets up the agent layer of a new project. Only you start it:

```
/fstack:new-project lendly
```

It asks for the folder, the purpose, the stack and the first domain words.
Then it makes a git repo on `main` with these parts:

- `AGENTS.md`, and a `CLAUDE.md` that imports it;
- an empty `GLOSSARY.md`;
- Backlog.md for the issues, with the `backlog:practice` skill named in
  `AGENTS.md`;
- OpenSpec, with project skills until the global skills exist;
- the spec checks, opted in with empty baselines and a vendored CLI;
- the affected-tests scripts.

It runs the checks, makes the first commit and offers to create a private
GitHub repository. App code and the stack are left to the first OpenSpec
change, which also fills in the test commands.
