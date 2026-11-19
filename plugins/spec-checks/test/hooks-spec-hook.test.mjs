import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cliFor, older, staleVendor, startOf, touchesSpecs } from '../hooks/spec-hook.mjs';
import { run as vendor } from '../lib/checks/vendor.mjs';
import { hasOpenspec, mainSpec, tempFolder, tempRepo } from './temp-repo.mjs';

const HOOK = fileURLToPath(new URL('../hooks/spec-hook.mjs', import.meta.url));
const PLUGIN_CLI = fileURLToPath(new URL('../bin/spec-checks', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));

describe('touchesSpecs', () => {
  const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } });
  const bash = (command, stdout = '') => ({ tool_name: 'Bash', tool_input: { command }, tool_response: { stdout } });

  it('holds for a file tool on a main spec', () => {
    assert.ok(touchesSpecs(edit('/repo/openspec/specs/loans/spec.md')));
    assert.ok(touchesSpecs(edit('openspec/specs/loans/spec.md')));
  });

  it('does not hold for a file tool on a delta or on a file that only mentions the specs', () => {
    assert.ok(!touchesSpecs(edit('/repo/openspec/changes/add-holds/specs/loans/spec.md')));
    const readme = { tool_name: 'Edit', tool_input: { file_path: '/repo/README.md', new_string: 'see openspec/specs' } };
    assert.ok(!touchesSpecs(readme));
  });

  it('holds for a command that names openspec, or a git command that rewrites files', () => {
    assert.ok(touchesSpecs(bash('openspec archive add-holds --yes')));
    assert.ok(touchesSpecs(bash('cd openspec && sed -i d specs/loans/spec.md')));
    assert.ok(touchesSpecs(bash('git rebase origin/main')));
    assert.ok(touchesSpecs(bash('git -C . merge feature')));
  });

  it('does not hold for a command whose output alone names a spec', () => {
    assert.ok(!touchesSpecs(bash('git status --short', ' M openspec/specs/loans/spec.md')));
    assert.ok(!touchesSpecs({}));
  });
});

describe('startOf', () => {
  it("takes an Edit payload's file folder, absolute or relative to its cwd", () => {
    assert.equal(startOf({ cwd: '/repo', tool_input: { file_path: '/repo/openspec/specs/loans/spec.md' } }), '/repo/openspec/specs/loans');
    assert.equal(startOf({ cwd: '/repo', tool_input: { file_path: 'openspec/specs/loans/spec.md' } }), '/repo/openspec/specs/loans');
  });

  it("takes a Bash payload's cwd", () => {
    assert.equal(startOf({ cwd: '/repo/worktree', tool_input: { command: 'openspec archive add-holds' } }), '/repo/worktree');
  });
});

describe('cliFor, older and staleVendor', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("prefers the project's copy in tools/spec-checks/bin/spec-checks over the plugin's", () => {
    assert.equal(cliFor(root), PLUGIN_CLI);
    vendor({ root });
    assert.equal(cliFor(root), join(root, 'tools/spec-checks/bin/spec-checks'));
  });

  it('compares versions by each number, not as text', () => {
    assert.equal(older('0.1.0', '0.2.0'), true);
    assert.equal(older('0.9.0', '0.10.0'), true);
    assert.equal(older('0.10.0', '0.9.0'), false);
    assert.equal(older('1.0.0', '0.9.9'), false);
    assert.equal(older('0.2.0', '0.2.0'), false);
  });

  it('warns where the vendored copy is older than the plugin, and only then', () => {
    assert.equal(staleVendor(root), null);
    vendor({ root });
    assert.equal(staleVendor(root), null);
    const versionFile = join(root, 'tools/spec-checks/VERSION');
    writeFileSync(versionFile, '0.0.1\n');
    assert.equal(
      staleVendor(root),
      `spec-checks: the project's copy in tools/spec-checks is 0.0.1, and the plugin is ${version}. Run spec-checks vendor to update it`,
    );
    writeFileSync(versionFile, '99.0.0\n');
    assert.equal(staleVendor(root), null);
  });
});

describe('the hook as a process', () => {
  const SPEC = 'openspec/specs/loans/spec.md';
  const requirements = {
    'A loan lasts three weeks': 'A loan SHALL last three weeks.',
    'A loan is renewed once': 'A member SHALL renew a loan once.',
  };
  let repo;

  beforeEach(() => {
    repo = tempRepo();
    repo.write({ [SPEC]: mainSpec('loans', requirements), 'README.md': 'start\n' });
  });
  afterEach(() => repo.remove());

  /** Run the hook on a tool call that wrote `file`, without CI in its environment. */
  const hook = (file) => {
    const env = { ...process.env };
    delete env.CI;
    const payload = { tool_name: 'Edit', cwd: repo.root, tool_input: { file_path: join(repo.root, file) } };
    return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env });
  };

  /** Adopt the checks at the base, then drop a requirement from the spec. */
  const dropOne = () => {
    repo.checks();
    repo.commit('Start');
    repo.setBase();
    const { 'A loan is renewed once': _, ...kept } = requirements;
    repo.write({ [SPEC]: mainSpec('loans', kept) });
  };

  it('exits 0 in a project without checks.json', () => {
    repo.commit('Start');
    repo.write({ [SPEC]: mainSpec('loans', {}) });
    const result = hook(SPEC);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });

  it('exits 0 for a payload that names no spec', () => {
    dropOne();
    const result = hook('README.md');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });

  it('exits 2 with the problem on stderr after a requirement is dropped', { skip: !hasOpenspec && 'no openspec CLI' }, () => {
    dropOne();
    const result = hook(SPEC);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /spec-checks dropped fails after this tool call/);
    assert.match(result.stderr, /loans › A loan is renewed once: left its main spec with no delta retiring it/);
    assert.doesNotMatch(result.stderr, /spec-checks validate failed/);
  });

  it('warns on stderr where the vendored copy is older than the plugin', { skip: !hasOpenspec && 'no openspec CLI' }, () => {
    repo.checks();
    vendor({ root: repo.root });
    writeFileSync(join(repo.root, 'tools/spec-checks/VERSION'), '0.0.1\n');
    repo.commit('Start');
    repo.setBase();
    const result = hook(SPEC);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /is 0\.0\.1, and the plugin is .*\. Run spec-checks vendor to update it/);
  });
});
