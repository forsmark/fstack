#!/usr/bin/env node
/**
 * Check and test the repository.
 *
 *   node scripts/verify.mjs                            everything
 *   node scripts/verify.mjs --affected [--base <ref>]  the same checks, and only
 *                                                      the tests that the changes
 *                                                      since <ref> can reach
 *   node scripts/verify.mjs --affected --list          the list alone: each
 *                                                      changed file, the rule it
 *                                                      matched, and the commands
 *                                                      a run starts. It runs
 *                                                      nothing.
 *
 * At the end of its work, a subagent runs `--affected --list` and puts the
 * list in its report. Then it runs `--affected` once. `--affected` refuses to
 * run until `--list` printed the same list: the same base, the same changed
 * files and the same commands. Every run prints the list again before it starts
 * a command. The full run needs no list. It runs once per batch, before a
 * release. The scope rules live in verify/affected.mjs.
 *
 * A run that passes on a clean tree leaves a record, so a later merge step can
 * skip its own run. See verify/record.mjs.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { holdHeavyLock } from './heavy-lock.mjs';
import { PACKAGE, ruleOf, SCRIPTS_DIR, scopeOf } from './verify/affected.mjs';
import { recordOf, snapshot, writeRecord } from './verify/record.mjs';

const CONFIG = {
  /** The ref that work merges into. `--base` overrides it. */
  base: 'origin/main',
  /**
   * The checks that run before the tests, in order, on the whole repository.
   * The first that fails stops the run.
   *
   * pnpm 12 installs before it runs a script when package.json and the lockfile
   * differ. That install rewrites pnpm-lock.yaml and node_modules, can need the
   * network, and fails on a dependency that cannot be installed. A changed
   * lockfile also leaves the tree dirty, so verify records no pass. A check or
   * test that runs a script against a package.json the lockfile does not match,
   * such as a test of a check that refuses a runtime dependency, runs
   * ['pnpm', '--config.verify-deps-before-run=false', 'run', '<script>'].
   */
  checks: [
    // PROJECT: add the lint step, for example ['pnpm', 'turbo', 'run', 'lint'].
    // PROJECT: add the typecheck step, for example ['pnpm', 'turbo', 'run', 'typecheck'].
  ],
  /** Every test of every workspace package. */
  testAll: ['pnpm', 'turbo', 'run', 'test'],
  /**
   * The tests of the packages that the filters select. A filter is
   * `...[<commit>]` for the packages changed since that commit and their
   * dependents, or a package name. turbo and `pnpm --filter` read the same syntax.
   * verify/record.test.mjs checks for this syntax. A project that passes no
   * filters changes that check too.
   */
  testFiltered: (filters) => [
    'pnpm',
    'turbo',
    'run',
    'test',
    ...filters.map((filter) => `--filter=${filter}`),
  ],
  /** The tests of SCRIPTS_DIR. The workspace's test runner never sees them. */
  testScripts: ['node', '--test', `${SCRIPTS_DIR}/**/*.test.mjs`],
};

const args = process.argv.slice(2);
const affected = args.includes('--affected');
const isListOnly = args.includes('--list');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : CONFIG.base;

const run = ([cmd, ...args]) => spawnSync(cmd, args, { stdio: 'inherit' }).status ?? 1;

// Take the snapshot before verify reads the changes. holdHeavyLock below starts
// this script again under the lock. That run takes its own snapshot under the
// lock. The tree can change while a run waits.
const before = snapshot(process.cwd(), base);

/**
 * The merge base with `base`, and the files changed since it: committed or
 * not, and untracked files too.
 */
function changes() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  // From the root, with -z: each path is relative to the root and unquoted, also
  // when verify runs in a subfolder or a name holds a character outside ASCII.
  const paths = (cmd) =>
    spawnSync('git', [...cmd, '-z'], { cwd: top.stdout.trim() || undefined, encoding: 'utf8' })
      .stdout.split('\0')
      .filter(Boolean);
  const merged = spawnSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' });
  if (merged.status !== 0) {
    console.error(`verify: found no common commit with ${base}. Fetch it, or pass --base <ref>.`);
    process.exit(1);
  }
  const mergeBase = merged.stdout.trim();
  // --no-renames lists a moved file at both paths, so the package it left still runs its tests.
  const files = [
    ...new Set([
      ...paths(['diff', '--name-only', '--no-renames', mergeBase]),
      ...paths(['ls-files', '--others', '--exclude-standard']),
    ]),
  ];
  return { mergeBase, files };
}

/** One line that says what an affected run tests. */
function describeScope(scope, files) {
  const changed = [...new Set(files.map((file) => PACKAGE.exec(file)?.[0]).filter(Boolean))];
  const packages =
    scope.packages === 'all'
      ? 'every package'
      : scope.packages === 'changed'
        ? `${changed.join(', ')} and their dependents`
        : 'no package';
  const extra = scope.extra.length ? `, plus ${scope.extra.join(', ')}` : '';
  return `verify: affected since ${base}: ${packages}${extra}. Script tests: ${scope.scripts ? 'yes' : 'no'}.`;
}

/** What one changed file runs, in words, from `ruleOf`. */
function describeFile(file, found) {
  if (found.rule === 'root') {
    return `${file}: every test, as a file outside the packages can change any of them`;
  }
  const added = [
    ...found.extra.map((name) => `the tests of ${name}`),
    ...(found.scripts && found.rule !== 'scripts' ? ['the script tests'] : []),
  ];
  const own =
    found.rule === 'package'
      ? `the tests of ${found.package} and of each package that depends on it`
      : found.rule === 'scripts'
        ? 'the script tests'
        : null;
  const plus = added.length ? `, plus ${added.join(', ')}, from EXTRA_TESTS` : '';
  if (own) return `${file}: ${own}${plus}`;
  return added.length
    ? `${file}: ${added.join(', ')}, from EXTRA_TESTS`
    : `${file}: no tests, as NO_TESTS matches it`;
}

/** A command as one shell line. An argument that a shell would change goes in quotes. */
const shellLine = (command) =>
  command
    .map((arg) => (/^[\w./:=@%+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`))
    .join(' ');

let scope = { packages: 'all', extra: [], scripts: SCRIPTS_DIR !== null };
let mergeBase;
let files = [];
if (affected) {
  const found = changes();
  mergeBase = found.mergeBase;
  files = found.files;
  scope = scopeOf(files);
}

/** The checks, then the tests that the scope selects, in the order they run. */
const commands = [...CONFIG.checks];
if (scope.packages !== 'none') {
  commands.push(
    scope.packages === 'all'
      ? CONFIG.testAll
      : // The merge base, not `base`: a base that moved on would add the files it changed.
        CONFIG.testFiltered([`...[${mergeBase}]`, ...scope.extra]),
  );
} else if (scope.extra.length > 0) {
  commands.push(CONFIG.testFiltered(scope.extra));
}
if (scope.scripts) commands.push(CONFIG.testScripts);

// The list. An agent reads it before the run, and puts it in its report.
const list = [];
if (affected) {
  list.push(describeScope(scope, files));
  const since = `since the merge base ${mergeBase.slice(0, 12)}`;
  const count = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  list.push(
    files.length === 0 ? `verify: no file changed ${since}.` : `verify: ${count} changed ${since}:`,
  );
  for (const file of files) list.push(`  ${describeFile(file, ruleOf(file))}`);
} else {
  list.push('verify: full run: every check and every test.');
}
if (commands.length === 0) list.push('verify: this run starts no command.');
else {
  list.push('verify: this run starts, in order:');
  for (const command of commands) list.push(`  ${shellLine(command)}`);
}

/**
 * The gate: `--list` keeps a hash of the affected list, and `--affected` runs
 * only when its own list has the same hash. The file sits in the checkout's git
 * folder, one for each worktree, so the tree stays clean.
 */
function listedFile() {
  const found = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  return found.status === 0 ? join(found.stdout.trim(), 'verify-list') : null;
}
const hash = createHash('sha256').update(list.join('\n')).digest('hex');
const script = relative(process.cwd(), process.argv[1]);
const LIST_COMMAND = shellLine([
  'node',
  script,
  '--affected',
  '--list',
  ...(base === CONFIG.base ? [] : ['--base', base]),
]);

/** Keeps the hash of the list for the gate. False when it cannot. */
function keepList() {
  const file = listedFile();
  try {
    if (!file) throw new Error('found no git folder');
    writeFileSync(`${file}.tmp`, `${hash}\n`);
    renameSync(`${file}.tmp`, file);
    return true;
  } catch (error) {
    const why = `could not keep the list, so --affected refuses to run: ${error.message}`;
    console.error(`verify: ${why}`);
    return false;
  }
}

/** Whether `--list` printed this list last. Says why not, when it did not. */
function isListed() {
  let listed = null;
  try {
    listed = readFileSync(listedFile() ?? '', 'utf8').trim();
  } catch {
    // No list yet.
  }
  if (listed === hash) return true;
  const why =
    listed === null
      ? 'an affected verify runs only after its list.'
      : 'the changed files, the base or the commands differ from the last list.';
  const next = `Run \`${LIST_COMMAND}\`, read the list, then run this command again.`;
  console.error(`verify: ${why} ${next}`);
  return false;
}

/** Runs the commands in order, and records a pass. Returns the exit status. */
function verifyAll() {
  for (const line of list) console.log(line);

  let status = 0;
  for (const command of commands) {
    status = run(command);
    if (status !== 0) break;
  }

  // Last, so a run that fails or is stopped leaves no record.
  const record = recordOf({
    before,
    after: snapshot(process.cwd(), base),
    status,
    scope: affected ? 'affected' : 'full',
  });
  if (record) {
    try {
      console.log(`verify: recorded the pass in ${writeRecord(record)}`);
    } catch (error) {
      console.log(`verify: could not record the pass: ${error.message}`);
    }
  } else if (status === 0) {
    console.log('verify: recorded nothing, as the tree was not clean or moved during the run');
  }
  return status;
}

// process.exitCode, not process.exit: output to a pipe can still be in a buffer.
if (isListOnly) {
  for (const line of list) console.log(line);
  if (!affected || keepList()) {
    console.log('verify: --list ran nothing. Run the same command without --list to run these.');
  } else {
    process.exitCode = 1;
  }
} else if (affected && !isListed()) {
  process.exitCode = 1;
} else {
  // After the gate, so a refused run does not wait for the lock. Under the lock
  // this script runs again from the top, so the gate also checks the list of
  // the tree that the run tests.
  holdHeavyLock();
  process.exitCode = verifyAll();
}
