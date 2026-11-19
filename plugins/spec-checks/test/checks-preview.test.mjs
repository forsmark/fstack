import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runCheck } from '../lib/cli.mjs';
import { ALL_CHECKS } from '../lib/config.mjs';
import { changeName, PREVIEW_CHECKS, runPreview } from '../lib/checks/preview.mjs';
import { hasOpenspec, mainSpec, tempRepo } from './temp-repo.mjs';

describe('the checks a preview runs', () => {
  // A check verify drops or renames must leave the preview too, or the two disagree.
  it('are each a check verify runs', () => {
    for (const check of PREVIEW_CHECKS) assert.ok(ALL_CHECKS.includes(check), check);
  });
});

describe('a change name', () => {
  it('is a folder name', () => {
    assert.equal(changeName('add-renewals-to-loans'), 'add-renewals-to-loans');
  });

  it('cannot leave the changes folder', () => {
    for (const name of ['../specs', 'a/b', '', '-x', undefined]) {
      assert.equal(changeName(name), null);
    }
  });
});

describe('runPreview', () => {
  let repo;
  beforeEach(() => {
    repo = tempRepo();
    repo.checks({ checks: ['validate', 'shall', 'repeated'] });
    repo.write({
      'openspec/specs/loans/spec.md': mainSpec('loans', { 'A loan lasts three weeks': 'A loan SHALL last three weeks.' }),
    });
    repo.commit('Start');
    repo.setBase();
  });
  afterEach(() => repo.remove());

  it('throws without a change name, or for a change with no proposal', () => {
    assert.throws(() => runPreview(repo.context([]), runCheck), /name a change: spec-checks preview <change>/);
    assert.throws(
      () => runPreview(repo.context(['add-renewals']), runCheck),
      /openspec\/changes\/add-renewals holds no proposal\.md/,
    );
  });

  it('fails a delta whose requirement will have more SHALL sentences than scenarios', { skip: !hasOpenspec && 'no openspec CLI' }, () => {
    repo.write({
      'openspec/changes/add-renewals/proposal.md': '## Why\n\nMembers ask for more time.\n',
      'openspec/changes/add-renewals/specs/loans/spec.md':
        '## ADDED Requirements\n\n### Requirement: A loan is renewed once\n\nA member SHALL renew a loan once. A renewal SHALL add three weeks.\n\n#### Scenario: A first renewal\n- **WHEN** a member renews a loan\n- **THEN** it is due three weeks later\n',
    });
    const result = runPreview(repo.context(['add-renewals']), runCheck);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /^shall: loans › A loan is renewed once: 2 SHALL sentences and 1 scenarios/);
    assert.match(result.summary, /^add-renewals passes validate, shall, repeated as it will sync/);
    // The preview touches nothing in the checkout.
    assert.equal(repo.git('status', '--porcelain', 'openspec/specs'), '');
  });
});
