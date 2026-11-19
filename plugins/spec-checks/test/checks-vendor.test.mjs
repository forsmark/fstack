import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { run, VENDOR_DIR } from '../lib/checks/vendor.mjs';
import { tempFolder, writeChecks } from './temp-repo.mjs';

const { version } = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));

let root;
beforeEach(() => {
  root = tempFolder();
  writeChecks(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('vendor', () => {
  it('copies bin/ and lib/ and writes VERSION into the project', () => {
    const result = run({ root });
    assert.deepEqual(result, { problems: [], summary: `copied version ${version} to ${VENDOR_DIR}` });
    const target = join(root, VENDOR_DIR);
    assert.ok(existsSync(join(target, 'bin', 'spec-checks')));
    assert.ok(existsSync(join(target, 'lib', 'cli.mjs')));
    assert.ok(existsSync(join(target, 'lib', 'checks', 'gate.mjs')));
    assert.equal(readFileSync(join(target, 'VERSION'), 'utf8'), `${version}\n`);
    assert.match(readFileSync(join(target, 'README.md'), 'utf8'), /Do not edit it here/);
  });

  it('names the version it replaces, and removes the files of the old copy', () => {
    run({ root });
    writeFileSync(join(root, VENDOR_DIR, 'VERSION'), '0.0.1\n');
    writeFileSync(join(root, VENDOR_DIR, 'lib', 'stale.mjs'), '');
    assert.equal(run({ root }).summary, `copied version ${version} to ${VENDOR_DIR}, replacing 0.0.1`);
    assert.ok(!existsSync(join(root, VENDOR_DIR, 'lib', 'stale.mjs')));
  });

  it('makes a copy that runs, and that refuses to vendor itself', () => {
    run({ root });
    const bin = join(root, VENDOR_DIR, 'bin', 'spec-checks');
    assert.equal(spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' }).status, 0);
    const itself = spawnSync(process.execPath, [bin, 'vendor', '--root', root], { encoding: 'utf8' });
    assert.equal(itself.status, 1);
    assert.match(itself.stderr, /vendor: this is the vendored copy\. Run vendor from the plugin/);
  });
});
