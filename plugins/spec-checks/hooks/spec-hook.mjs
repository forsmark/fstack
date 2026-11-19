#!/usr/bin/env node
/**
 * PostToolUse: after a tool call that touched openspec/specs, check that every
 * spec still parses and still holds every requirement it held at the base.
 * A spec merge can swallow a heading and drop requirements while the file stays
 * well formed, so the checks run on every such edit, not when someone remembers.
 *
 * It does nothing in a project without openspec/checks.json. It takes the
 * project from the payload, not from CLAUDE_PROJECT_DIR, which names the main
 * checkout even in a worktree. It runs the project's vendored copy of the CLI
 * where one exists, so the project's pinned version judges. Exit 2 feeds the
 * problems back to the model.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from '../lib/config.mjs';

/** A git command that can rewrite files in the working tree. */
const GIT_WRITES = /\bgit\b[^|;&\n]*?\s(?:merge|rebase|pull|cherry-pick|checkout|switch|reset|restore|stash|am|apply|revert)\b/;

/**
 * Whether a tool call can have changed a main spec. It reads what the call did,
 * not what it printed: a `git status` that lists a spec changed nothing. A file
 * tool counts when its file is under openspec/specs. A shell command counts when
 * it names openspec at all, so `cd openspec && sed -i …` counts, or runs a git
 * command that rewrites files.
 */
export function touchesSpecs(payload) {
  const input = payload?.tool_input ?? {};
  if (typeof input.file_path === 'string') return /(^|\/)openspec\/specs\//.test(input.file_path);
  if (typeof input.command === 'string') return /openspec/.test(input.command) || GIT_WRITES.test(input.command);
  return false;
}

/** The folder a payload's tool call worked in: its file's folder, or the call's cwd. */
export function startOf(payload) {
  const file = payload.tool_input?.file_path;
  const cwd = payload.cwd ?? process.cwd();
  if (typeof file === 'string' && file !== '') return dirname(isAbsolute(file) ? file : resolve(cwd, file));
  return cwd;
}

/** The CLI to run: the project's vendored copy, or this plugin's. */
export function cliFor(root) {
  const vendored = join(root, 'tools', 'spec-checks', 'bin', 'spec-checks');
  return existsSync(vendored) ? vendored : join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'spec-checks');
}

const versionOf = (path) => (existsSync(path) ? readFileSync(path, 'utf8').match(/\d+\.\d+\.\d+/)?.[0] ?? null : null);

/** Whether `a` is an older version than `b`. */
export const older = (a, b) => {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));
  for (let at = 0; at < 3; at += 1) if (x[at] !== y[at]) return x[at] < y[at];
  return false;
};

/** A warning where the project's vendored copy is older than this plugin, or null. */
export function staleVendor(root) {
  const vendored = versionOf(join(root, 'tools', 'spec-checks', 'VERSION'));
  const plugin = versionOf(join(dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json'));
  if (!vendored || !plugin || !older(vendored, plugin)) return null;
  return `spec-checks: the project's copy in tools/spec-checks is ${vendored}, and the plugin is ${plugin}. Run spec-checks vendor to update it`;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  if (!touchesSpecs(payload)) return 0;
  const start = startOf(payload);
  if (!existsSync(start)) return 0;
  const root = findRoot(start);
  if (!root || !existsSync(join(root, 'openspec', 'specs'))) return 0;

  const cli = cliFor(root);
  const failures = [];
  const stale = staleVendor(root);
  if (stale) process.stderr.write(`${stale}\n`);
  for (const check of ['validate', 'dropped']) {
    const result = spawnSync(process.execPath, [cli, check, '--root', root], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) failures.push(`spec-checks ${check} fails after this tool call. The fault may be older than the call:\n${`${result.stdout}${result.stderr}`.trim()}`);
  }
  if (failures.length === 0) return 0;
  process.stderr.write(`${failures.join('\n\n')}\n`);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
