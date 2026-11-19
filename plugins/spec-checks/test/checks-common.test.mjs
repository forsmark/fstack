import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { baselineAtBase, baseOf, mainSpecs } from '../lib/checks/common.mjs';
import { tempRepo, withEnv } from './temp-repo.mjs';

const LIST = 'openspec/shall-not-yet.txt';

let repo;
beforeEach(() => {
  repo = tempRepo();
  repo.write({ 'README.md': 'start\n' });
});
afterEach(() => repo.remove());

describe('baselineAtBase', () => {
  it('is null where the base has no checks.json, so the adopting branch may list gaps', () => {
    repo.commit('Start');
    repo.setBase();
    repo.checks();
    repo.write({ [LIST]: 'loans › A loan lasts three weeks › 1\n' });
    assert.equal(baselineAtBase(repo.context(), LIST), null);
  });

  it('is empty where the base has checks.json and no list', () => {
    repo.checks();
    repo.commit('Adopt the checks');
    repo.setBase();
    repo.write({ [LIST]: 'loans › A loan lasts three weeks › 1\n' });
    assert.deepEqual(baselineAtBase(repo.context(), LIST), []);
  });

  it('is the list as the base had it', () => {
    repo.checks();
    repo.write({ [LIST]: '# Gaps\nloans › A loan lasts three weeks › 1\n' });
    repo.commit('Adopt the checks');
    repo.setBase();
    repo.write({ [LIST]: '' });
    assert.deepEqual(baselineAtBase(repo.context(), LIST), ['loans › A loan lasts three weeks › 1']);
  });

  it('is null where there is no base', () => {
    repo.checks();
    repo.commit('Adopt the checks');
    assert.equal(withEnv({ CI: undefined }, () => baselineAtBase(repo.context(), LIST)), null);
  });
});

describe('baseOf', () => {
  beforeEach(() => {
    repo.checks({ baseRefs: ['origin/trunk', 'origin/main'] });
    repo.commit('Start');
  });

  it('throws where CI is set and no base ref exists', () => {
    const ctx = repo.context();
    assert.throws(
      () => withEnv({ CI: 'true' }, () => baseOf(ctx)),
      /none of origin\/trunk, origin\/main exists, so nothing can be compared\. In CI, fetch the full history/,
    );
  });

  it('notes once and returns null where CI is unset and no base ref exists', () => {
    const ctx = repo.context();
    withEnv({ CI: undefined }, () => {
      assert.equal(baseOf(ctx), null);
      assert.equal(baseOf(ctx), null);
    });
    assert.deepEqual(ctx.notes, ['no base: none of origin/trunk, origin/main exists, so nothing is compared']);
  });

  it('is the merge base with the first base ref that exists', () => {
    const start = repo.git('rev-parse', 'HEAD');
    repo.setBase();
    repo.commit('Later on main');
    repo.setBase('refs/remotes/origin/trunk');
    repo.git('reset', '-q', '--hard', start);
    repo.commit('On the branch');
    assert.equal(baseOf(repo.context()), start);
  });
});

describe('mainSpecs', () => {
  it('reads each folder of openspec/specs that holds a spec.md, sorted', () => {
    repo.write({
      'openspec/specs/loans/spec.md': '# loans\n',
      'openspec/specs/fines/spec.md': '# fines\n',
      'openspec/specs/drafts/notes.md': 'no spec\n',
    });
    assert.deepEqual(
      mainSpecs(repo.root).map(({ capability }) => capability),
      ['fines', 'loans'],
    );
  });
});
