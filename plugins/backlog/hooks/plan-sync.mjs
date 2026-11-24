#!/usr/bin/env node
/**
 * PostToolUse and PostToolUseFailure: after a tool call that can have changed
 * an OpenSpec change's tasks.md, copy that file into the plan of the task that
 * the current task branch holds. A failed call counts, because a command such
 * as `sed … tasks.md && npm test` fails when a test fails, after the edit.
 * tasks.md stays the one plan that anyone edits, and the board and the web
 * view show it with its check marks.
 *
 * The hook writes one task only. On the branch `task-12` it writes TASK-12, and
 * on any other branch it writes nothing. That keeps the practice's one-writer
 * rule: no branch changes the task file of another branch. The task links its
 * change through the reference `openspec/changes/<change>`.
 *
 * It finds the checkout from the call's file, from a leading `cd <dir>` or a
 * `git -C <dir>` in a shell command, or from the call's cwd. It compares the
 * plan in the form Backlog.md stores, so an equal plan leaves the task file
 * alone. After a copy it tells Claude which task file changed, through
 * additionalContext, so the file goes into the next commit. When another
 * process holds Backlog.md's lock on the task, it tries again a few times.
 *
 * It does nothing in a project without a Backlog.md config or without
 * openspec/changes. Exit 2 feeds a problem back to the model. BACKLOG_BIN names
 * another backlog command, for the tests.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The config files that mark a Backlog.md project root. */
const CONFIG_FILES = ['backlog.config.yml', join('backlog', 'config.yml'), join('.backlog', 'config.yml')];

/** The plan of an open change. An archived change keeps its tasks.md, and its task is finished. */
const TASKS_FILE = /(^|\/)openspec\/changes\/(?!archive\/)[^/]+\/tasks\.md$/;

/** A reference that links an open change. The group is the change's name. */
const LINK = /^(?:\.\/)?openspec\/changes\/(?!archive\/)([^/]+)\/?$/;

/**
 * A git command that can bring another tasks.md into the working tree. stash,
 * reset and restore are left out: they only go back to a committed tasks.md,
 * and a copy after them would change the task file again and stop a
 * `git stash pop` or a rebase.
 */
const GIT_WRITES = /\bgit\b[^|;&\n]*?\s(?:merge|rebase|pull|cherry-pick|checkout|switch|am|apply|revert)\b/;

/** Backlog.md's answer when another process edits the task at the same moment. */
const LOCKED = /is being modified by another process/;

/** Backlog.md's answer for a task ID that this checkout does not hold. */
const NOT_FOUND = /\bTask \S+ not found\b/;

/** The tries for a locked task, and the wait between them. */
const TRIES = 5;
const WAIT_MS = 200;

/** A folder argument: double-quoted, single-quoted or bare. */
const DIR_ARG = String.raw`(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))`;
const LEADING_CD = new RegExp(String.raw`^\s*cd\s+${DIR_ARG}\s*(?:&&|;)`);
const GIT_C = new RegExp(String.raw`\bgit\s+-C\s+${DIR_ARG}`);

/**
 * Whether a tool call can have changed a plan or a link. A file tool counts
 * when its file is the tasks.md of an open change. A shell command counts when
 * it names a tasks.md or a change folder, or runs a git command that rewrites
 * files, such as a merge that brings a new tasks.md.
 */
export function touchesPlans(payload) {
  const input = payload?.tool_input ?? {};
  if (typeof input.file_path === 'string') return TASKS_FILE.test(input.file_path);
  if (typeof input.command === 'string') return /tasks\.md|openspec\/changes\//.test(input.command) || GIT_WRITES.test(input.command);
  return false;
}

/** The folder a shell command names with a leading `cd <dir>` or a `git -C <dir>`, or null. */
export function dirOfCommand(command) {
  const match = command.match(LEADING_CD) ?? command.match(GIT_C);
  if (!match) return null;
  const dir = match[1] ?? match[2] ?? match[3];
  return dir === '~' || dir.startsWith('~/') ? join(homedir(), dir.slice(1)) : dir;
}

/** The folder a payload's tool call worked in: its file's folder, the folder its command names, or its cwd. */
export function startOf(payload) {
  const input = payload.tool_input ?? {};
  const cwd = payload.cwd ?? process.cwd();
  if (typeof input.file_path === 'string' && input.file_path !== '') return dirname(resolve(cwd, input.file_path));
  const named = typeof input.command === 'string' ? dirOfCommand(input.command) : null;
  if (named) return isAbsolute(named) ? named : resolve(cwd, named);
  return cwd;
}

/** The nearest folder at or above `start` that holds a Backlog.md config, or null. */
export function findRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (CONFIG_FILES.some((file) => existsSync(join(dir, file)))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** The project's task prefix, `task` unless a config sets `task_prefix`. */
export function prefixOf(root) {
  for (const file of CONFIG_FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const prefix = readFileSync(path, 'utf8').match(/^task_prefix:\s*["']?([A-Za-z]+)["']?\s*$/m)?.[1];
    if (prefix) return prefix;
  }
  return 'task';
}

/** The task ID that a task branch names, such as TASK-12 for `task-12`, or null for any other branch. */
export function taskIdOf(branch, prefix) {
  const number = branch?.match(new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)*)$`, 'i'))?.[1];
  return number ? `${prefix.toUpperCase()}-${number}` : null;
}

/** The branch checked out in `root`, or null when HEAD is detached or git fails. */
function branchOf(root) {
  const result = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The names of the open changes that a task links. */
export function linkedChanges(task) {
  return (task.references ?? []).map((ref) => ref.trim().match(LINK)?.[1]).filter(Boolean);
}

/** A plan in the form Backlog.md stores it: LF line ends, no run of more than one blank line, no outer whitespace. */
export const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Runs backlog in `root` and returns its stdout. With `missingOk`, it returns
 * null when the task it names does not exist. It tries again while another
 * process holds the task's lock.
 */
function backlog(root, args, { missingOk = false } = {}) {
  const env = { ...process.env };
  delete env.BACKLOG_CWD; // It would send backlog to another project than the one the edit is in.
  for (let attempt = 1; ; attempt++) {
    const result = spawnSync(process.env.BACKLOG_BIN || 'backlog', args, { cwd: root, env, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status === 0) return result.stdout;
    if (missingOk && NOT_FOUND.test(result.stderr)) return null;
    if (!LOCKED.test(result.stderr) || attempt === TRIES) {
      throw new Error(`backlog ${args.slice(0, 3).join(' ')} failed: ${result.stderr.trim()}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WAIT_MS * attempt);
  }
}

/**
 * Copies the tasks.md of the change that task `id` links into its plan.
 * Returns the copy it made, or null, and the problems it found.
 */
export function syncTask(root, id) {
  const view = backlog(root, ['task', 'view', id, '--json'], { missingOk: true });
  if (view === null) return { copied: null, problems: [] };
  const { task } = JSON.parse(view);
  if (task.archived) return { copied: null, problems: [] };
  const changes = linkedChanges(task).filter((change) => existsSync(join(root, 'openspec', 'changes', change, 'tasks.md')));
  if (changes.length === 0) return { copied: null, problems: [] };
  if (changes.length > 1) {
    return { copied: null, problems: [`${id} links ${changes.length} open changes (${changes.join(', ')}). A task carries one change, so its plan was not copied.`] };
  }
  const change = changes[0];
  const plan = normalize(readFileSync(join(root, 'openspec', 'changes', change, 'tasks.md'), 'utf8'));
  if (normalize(task.implementationPlan ?? '') === plan) return { copied: null, problems: [] };
  backlog(root, ['task', 'edit', id, `--plan=${plan}`, '--plain']);
  return { copied: { id, change, path: join(root, task.path) }, problems: [] };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  if (!touchesPlans(payload)) return 0;
  const start = startOf(payload);
  if (!existsSync(start)) return 0;
  const root = findRoot(start);
  if (!root || !existsSync(join(root, 'openspec', 'changes'))) return 0;
  const id = taskIdOf(branchOf(root), prefixOf(root));
  if (!id) return 0;

  let result;
  try {
    result = syncTask(root, id);
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'the backlog CLI is not on PATH. Install it with npm i -g backlog.md@1.57.4' : error.message;
    result = { copied: null, problems: [`The plan of ${id} was not copied: ${reason}`] };
  }
  if (result.problems.length > 0) {
    process.stderr.write(`backlog plan sync: ${result.problems.join('\n')}\n`);
    return 2;
  }
  if (result.copied) {
    const { id: copiedId, change, path } = result.copied;
    const additionalContext = `backlog plan sync: the plan of ${copiedId} now matches openspec/changes/${change}/tasks.md. The task file ${path} changed and is not committed yet.`;
    const hookEventName = payload.hook_event_name === 'PostToolUseFailure' ? 'PostToolUseFailure' : 'PostToolUse';
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } })}\n`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
