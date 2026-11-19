/**
 * A throwaway git repo for the tests that read history or run a check in a
 * project. Each test makes its own and removes it. `setBase()` moves the ref the
 * checks take as the branch's base to HEAD.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CONFIG_FILE, loadConfig } from '../lib/config.mjs';

// Git reads no config of this machine, and every commit has the same author.
const ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

/** Write openspec/checks.json under `root`, as `config` over nothing. The defaults fill the rest. */
export function writeChecks(root, config = {}) {
  mkdirSync(join(root, 'openspec'), { recursive: true });
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
}

/** A context to run one check in-process, as the command line builds it. Its notes go to `notes`. */
export function contextFor(root, args = []) {
  const notes = [];
  return {
    root,
    config: loadConfig(root),
    args,
    write: args.includes('--write'),
    base: undefined,
    note: (line) => notes.push(line),
    notes,
  };
}

/** A temp folder that is no git repo. */
export function tempFolder(prefix = 'spec-checks-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function tempRepo() {
  const root = tempFolder();
  // The checks run git themselves, so they must not read the machine's config either.
  Object.assign(process.env, ENV);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...ENV } });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  return {
    root,
    git,
    /** Write each file as its text, or remove it where its text is null. */
    write(files) {
      for (const [path, text] of Object.entries(files)) {
        if (text === null) {
          rmSync(join(root, path), { recursive: true, force: true });
          continue;
        }
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
    },
    /** Write openspec/checks.json. */
    checks: (config = {}) => writeChecks(root, config),
    /** Commit every file, and return the commit. */
    commit(message) {
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', message);
      return git('rev-parse', 'HEAD');
    },
    /** Point a ref at HEAD. The default is the base ref of the default config. */
    setBase: (ref = 'refs/remotes/origin/main') => git('update-ref', ref, 'HEAD'),
    context: (args = []) => contextFor(root, args),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Run `fn` with some environment variables set, and unset where the value is
 * undefined. It puts back the earlier values after, also when `fn` throws.
 */
export function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((name) => [name, process.env[name]]));
  const apply = (values) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(vars);
  try {
    return fn();
  } finally {
    apply(before);
  }
}

/** Whether the openspec CLI runs. The tests that need it skip without it. */
export const hasOpenspec = spawnSync('openspec', ['--version'], { encoding: 'utf8' }).status === 0;

/** A spec in openspec/specs as OpenSpec validates it, with one scenario per requirement. */
export function mainSpec(capability, requirements) {
  const blocks = Object.entries(requirements).map(
    ([name, rule]) =>
      `### Requirement: ${name}\n\n${rule}\n\n#### Scenario: ${name} holds\n- **WHEN** a member asks\n- **THEN** ${name.toLowerCase()}\n`,
  );
  return `# ${capability} Specification\n\n## Purpose\n\nWhat the library does for ${capability}, and the rules it keeps.\n\n## Requirements\n\n${blocks.join('\n')}`;
}
