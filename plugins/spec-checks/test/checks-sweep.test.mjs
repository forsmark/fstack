import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readPair, runDismissed, runGroups } from '../lib/checks/sweep.mjs';
import { mainSpec, tempRepo } from './temp-repo.mjs';

const LOANS = mainSpec('loans', {
  'A loan lasts three weeks': 'A loan SHALL last three weeks.',
  'A loan is renewed once': 'A member SHALL renew a loan once.',
});
const FINES = mainSpec('fines', { 'A Fine is charged per day': 'A Fine SHALL be charged for each day a loan is late.' });

let repo;
beforeEach(() => {
  repo = tempRepo();
  repo.write({
    'openspec/specs/loans/spec.md': LOANS,
    'openspec/specs/fines/spec.md': FINES,
    'openspec/specs/holds/spec.md': mainSpec('holds', { 'A hold waits a week': 'A hold SHALL wait a week.' }),
  });
});
afterEach(() => repo.remove());

describe('sweep-groups', () => {
  const groups = (sweepGroups) => {
    repo.checks({ sweep: { groups: sweepGroups } });
    return runGroups(repo.context());
  };

  it('fails where the config names no groups', () => {
    assert.deepEqual(groups({}).problems, ['openspec/checks.json names no sweep groups under "sweep.groups"']);
  });

  it('passes where each spec is in exactly one group', () => {
    assert.deepEqual(groups({ lending: ['loans', 'holds'], money: ['fines'] }), {
      problems: [],
      summary: 'each of 3 specs is in one of 2 sweep groups',
    });
  });

  it('fails a spec in no group', () => {
    assert.deepEqual(groups({ lending: ['loans', 'holds'] }).problems, ['fines is in no sweep group']);
  });

  it('fails a spec in two groups', () => {
    assert.deepEqual(groups({ lending: ['loans', 'holds', 'fines'], money: ['fines'] }).problems, [
      'fines is in 2 sweep groups: lending, money',
    ]);
  });

  it('fails a group that names no spec', () => {
    assert.deepEqual(groups({ lending: ['loans', 'holds', 'renewals'], money: ['fines'] }).problems, [
      'sweep group lending names renewals, which is no spec',
    ]);
  });
});

describe('readPair', () => {
  it('reads both sides of a dismissed line, and null for a side that names no requirement', () => {
    assert.deepEqual(readPair('loans › A loan lasts three weeks ⇄ fines'), [
      { capability: 'loans', requirement: 'A loan lasts three weeks' },
      null,
    ]);
    assert.equal(readPair('no pair here'), null);
  });
});

describe('sweep-dismissed', () => {
  const DISMISSED = 'openspec/disagreements-dismissed.txt';
  const PAIR = 'loans › A loan lasts three weeks ⇄ fines › A Fine is charged per day';

  beforeEach(() => repo.checks());

  /** The dismissed check's result, and the lines it printed. */
  const dismissed = (t) => {
    const logs = t.mock.method(console, 'log', () => {});
    const result = runDismissed(repo.context());
    logs.mock.restore();
    return { ...result, printed: logs.mock.calls.map((call) => call.arguments[0]) };
  };

  it('passes where there is no dismissed list', (t) => {
    assert.equal(dismissed(t).summary, `no ${DISMISSED}, so no pair is dismissed`);
  });

  it('lists no pair whose line no commit added yet', (t) => {
    repo.commit('Start');
    repo.write({ [DISMISSED]: `${PAIR}\n`, 'openspec/specs/loans/spec.md': LOANS.replace('three weeks.', 'four weeks.') });
    const result = dismissed(t);
    assert.deepEqual(result.printed, []);
    assert.match(result.summary, /^0 of 1 dismissed pairs/);
  });

  it('lists no pair whose requirements are as they were when it was listed', (t) => {
    repo.write({ [DISMISSED]: `# Pairs a sweep read and dismissed.\n${PAIR}\n` });
    repo.commit('Dismiss a pair');
    repo.write({ 'openspec/specs/loans/spec.md': LOANS.replace('renew a loan once', 'renew a loan twice') });
    repo.commit('Change another requirement');
    const result = dismissed(t);
    assert.deepEqual(result.printed, []);
    assert.deepEqual(result.problems, []);
  });

  it('lists a pair whose requirement changed since it was listed', (t) => {
    repo.write({ [DISMISSED]: `${PAIR}\n` });
    const listed = repo.commit('Dismiss a pair');
    repo.write({ 'openspec/specs/loans/spec.md': LOANS.replace('last three weeks.', 'last four weeks.') });
    const result = dismissed(t);
    assert.deepEqual(result.printed, [
      `${PAIR}\n    loans › A loan lasts three weeks changed since ${listed.slice(0, 7)}`,
    ]);
    assert.equal(
      result.summary,
      '1 of 1 dismissed pairs have a requirement that changed since the pair was listed. A sweep reads them again',
    );
  });

  it('lists a pair whose requirement is gone since it was listed', (t) => {
    repo.write({ [DISMISSED]: `${PAIR}\n` });
    const listed = repo.commit('Dismiss a pair');
    repo.write({ 'openspec/specs/fines/spec.md': null });
    repo.commit('Drop the fines spec');
    assert.deepEqual(dismissed(t).printed, [
      `${PAIR}\n    fines › A Fine is charged per day is gone since ${listed.slice(0, 7)}`,
    ]);
  });
});
