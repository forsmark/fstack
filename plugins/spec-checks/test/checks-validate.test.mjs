/**
 * The validate check with a stand-in openspec on the PATH, which prints a set
 * version and a set report. One test runs the real openspec where it is installed.
 */
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { run, TESTED_OPENSPEC } from '../lib/checks/validate.mjs';
import { hasOpenspec, mainSpec, tempRepo, withEnv } from './temp-repo.mjs';

const SPEC = mainSpec('loans', {
  'A loan lasts three weeks': 'A loan SHALL last three weeks.',
  'A loan is renewed once': 'A member SHALL renew a loan once.',
});
const LASTS = 'loans › A loan lasts three weeks';
const LONG = {
  level: 'WARNING',
  path: 'requirements[0]',
  message: 'Requirement text is very long (>500 characters). Move examples and edge cases into scenarios.',
};

let repo;
let bin;
beforeEach(() => {
  repo = tempRepo();
  repo.checks();
  repo.write({ 'openspec/specs/loans/spec.md': SPEC });
  repo.commit('Adopt the checks');
  repo.setBase();
  bin = join(repo.root, '.bin');
  mkdirSync(bin);
});
afterEach(() => repo.remove());

/** Put an openspec on the PATH that prints `version` and `report`, then exits with `status`. */
function fakeOpenspec({ version = TESTED_OPENSPEC[0], report = { items: [] }, status = 0 } = {}) {
  const path = join(bin, 'openspec');
  writeFileSync(
    path,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi\ncat <<'JSON'\n${typeof report === 'string' ? report : JSON.stringify(report)}\nJSON\nexit ${status}\n`,
  );
  chmodSync(path, 0o755);
}

/** The validate check with only the stand-in on the PATH. */
const validate = ({ path = `${bin}:/usr/bin:/bin` } = {}) => {
  const ctx = repo.context();
  const result = withEnv({ PATH: path }, () => run(ctx));
  return { ...result, notes: ctx.notes };
};

describe('the validate check', () => {
  it('passes a report with no issues, and notes nothing for a tested version', () => {
    fakeOpenspec();
    const result = validate();
    assert.deepEqual(result.problems, []);
    assert.equal(result.summary, 'every spec validates, with 0 of 2 requirements long not yet');
    assert.deepEqual(result.notes, []);
  });

  it('notes a warning when the openspec version is not one it was tested with', () => {
    fakeOpenspec({ version: '0.9.0' });
    assert.deepEqual(validate().notes, [`openspec 0.9.0 is untested here. Tested: ${TESTED_OPENSPEC.join(', ')}`]);
  });

  it('notes an unknown version when openspec prints none', () => {
    fakeOpenspec({ version: 'unknown' });
    assert.match(validate().notes[0], /^openspec of an unknown version is untested here/);
  });

  it('fails a long requirement the baseline does not list, and passes one it lists', () => {
    fakeOpenspec({ report: { items: [{ id: 'loans', issues: [LONG] }] }, status: 1 });
    assert.match(validate().problems[0], new RegExp(`^${LASTS}: its text above the first scenario is over 500 characters`));
    repo.write({ 'openspec/long-requirements-not-yet.txt': `${LASTS}\n` });
    repo.commit('List the long requirement');
    repo.setBase();
    assert.deepEqual(validate().problems, []);
  });

  it('throws where openspec prints no report', () => {
    fakeOpenspec({ report: 'not json', status: 3 });
    assert.throws(() => validate(), /openspec validate printed no report \(exit 3\)/);
  });

  it('throws where no openspec is on the PATH', () => {
    assert.throws(() => validate({ path: bin }), /no openspec CLI on the PATH/);
  });

  it('passes a valid spec with the real openspec', { skip: !hasOpenspec && 'no openspec CLI' }, () => {
    assert.deepEqual(run(repo.context()).problems, []);
  });
});
