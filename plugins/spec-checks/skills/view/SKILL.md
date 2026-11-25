---
name: view
description: Shows the project's OpenSpec specs as web pages on 127.0.0.1, with each scenario's steps and its test from the coverage map. Use when the user asks to see, read or browse the specs, or the tests behind a spec's scenarios.
---

# View the specs

`spec-checks view` starts a local, read-only web server for the main specs in `openspec/specs`. It needs no `openspec/checks.json`. Without that file, the pages show no coverage.

1. From the project root, run `spec-checks view --open` with the Bash tool and `run_in_background: true`. The server runs until it is stopped, so a call in the foreground never returns.

   Done when the command runs in the background.

2. Read the first line of the command's output file: `view: http://127.0.0.1:<port>/`. When the default port is in use, the viewer takes a free port, so read the port and do not assume it.

   Done when you have the URL.

3. Give the user the URL. When the user asked about one spec, give its page: `<url>spec/<capability>`. `--open` opens the page in the default browser of the machine. A remote session has no browser, so the URL is all the user gets there.

   Done when the user has the URL.

4. Leave the server running. Each open page reloads when a spec or a coverage map changes. Stop the server with TaskStop when the user asks, or before you start a second one.

When the command fails, give the user its message:

- `no openspec/specs at or above <folder>`: the project has no main specs yet. A spec appears there when a change that adds it is archived.
- `port <n> is in use`: this happens only with `--port`. Run it again without `--port`.
