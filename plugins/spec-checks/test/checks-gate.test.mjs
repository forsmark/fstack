import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { changeFolder, changesSince, compare, gateOf, run } from '../lib/checks/gate.mjs';
import { printout } from '../lib/specs/gate.mjs';
import { tempRepo } from './temp-repo.mjs';

// A sync merged one SHALL sentence into another, and the requirement kept its
// one scenario. No reviewer sees the rule go.
const PROPOSED = `## ADDED Requirements

### Requirement: Each sent letter is logged with its template commit

For each Member a letter went to, the log SHALL keep the template's name, its commit, and the send time. It SHALL be removed with the Member.

#### Scenario: A logged letter
- **WHEN** a letter goes to a Member from a template at a commit
- **THEN** the log names the template, that commit and the send time
`;
const MERGED = PROPOSED.replace(
  'and the send time. It SHALL be removed with the Member.',
  'and the send time, until the Member is removed.',
);
const KEY = 'overdue-letters › Each sent letter is logged with its template commit';
const PROBLEM = `track-letters: ${KEY} lost a SHALL word since the gate and kept every scenario`;

const CHANGE = 'openspec/changes/track-letters';
const DELTA = `${CHANGE}/specs/overdue-letters/spec.md`;
const PROPOSAL = `${CHANGE}/proposal.md`;

let repo;

beforeEach(() => {
  repo = tempRepo();
  repo.checks();
  repo.write({ 'README.md': 'start\n' });
  repo.commit('Start');
  repo.setBase();
});

afterEach(() => repo.remove());

/** The main session proposes `track-letters` on the branch, as the proposal commit. */
function propose(delta = PROPOSED) {
  repo.write({
    [PROPOSAL]: '## Why\n\nA reason.\n',
    [DELTA]: delta,
    [`${CHANGE}/design.md`]: 'Decided.\n',
  });
  return repo.commit('Propose track-letters');
}

/** The gate check as verify runs it. */
const check = () => run(repo.context(['--check']));

describe('compare', () => {
  it('reports the merged sentence of an archived change, with its text at the gate and now', () => {
    const gate = propose();
    const archived = 'openspec/changes/archive/2026-11-10-track-letters';
    repo.write({
      [CHANGE]: null,
      [`${archived}/proposal.md`]: '## Why\n\nA reason.\n',
      [`${archived}/design.md`]: 'Decided.\n',
      [`${archived}/specs/overdue-letters/spec.md`]: MERGED,
    });
    repo.commit('Sync the track-letters specs and archive the change');

    const result = compare(repo.root, 'track-letters', gate);
    assert.deepEqual(
      result.problems.map(({ key }) => key),
      [KEY],
    );
    const text = printout(result);
    assert.match(text, /at the gate 2 SHALL words, 1 scenario, now 1 SHALL word, 1 scenario/);
    assert.match(text, /It SHALL be removed with the Member\./);
    assert.match(text, /until the Member is removed\./);
    assert.match(text, /design\.md: unchanged since the gate/);
  });

  it('throws for a change that is neither in its folder nor archived', () => {
    const gate = propose();
    assert.throws(() => compare(repo.root, 'no-such-change', gate), /no change no-such-change under openspec\/changes/);
  });
});

describe('gate --check', () => {
  it('fails a change whose delta lost a SHALL word and no scenario', () => {
    propose();
    repo.write({ [DELTA]: MERGED });
    repo.commit('Apply track-letters');
    assert.deepEqual(check().problems, [PROBLEM]);
  });

  it('passes the same change once proposal.md names the rule under its heading', () => {
    propose();
    repo.write({
      [DELTA]: MERGED,
      [PROPOSAL]:
        "## Why\n\nA reason.\n\n## Rules dropped after the proposal\n\n- Each sent letter is logged with its template commit: member-data keeps it for a year.\n",
    });
    repo.commit('Apply track-letters');
    const result = check();
    assert.deepEqual(result.problems, []);
    assert.match(result.summary, /^1 changes touched on this branch \(track-letters\)/);
  });

  it('passes a change whose delta lost a SHALL word together with its scenario', () => {
    const two = PROPOSED.replace(
      '- **THEN** the log names the template, that commit and the send time',
      '- **THEN** the log names the template, that commit and the send time\n\n#### Scenario: A removed Member\n- **WHEN** a Member is removed\n- **THEN** their log entries are gone',
    );
    propose(two);
    repo.write({ [DELTA]: MERGED });
    repo.commit('Apply track-letters');
    assert.deepEqual(check().problems, []);
  });

  it('takes the newest commit with the Spec-Gate trailer as the gate, so a corrected proposal is approved', () => {
    propose();
    repo.write({ [DELTA]: MERGED });
    const corrected = repo.commit('Correct the track-letters proposal\n\nSpec-Gate: track-letters');
    repo.write({ [`${CHANGE}/tasks.md`]: '- [x] 1.1 Build\n' });
    repo.commit('Build track-letters');
    assert.equal(gateOf(repo.root, 'track-letters'), corrected);
    const result = check();
    assert.deepEqual(result.problems, []);
    assert.match(result.summary, /\(track-letters\)/);
  });

  it('leaves alone a rule dropped before the base, when the gate is before the base too', () => {
    propose();
    repo.write({ [DELTA]: MERGED });
    repo.commit('Apply track-letters');
    repo.setBase();
    repo.write({ [`${CHANGE}/tasks.md`]: '- [x] 1.1 Build\n' });
    repo.commit('Tick track-letters');
    const result = check();
    assert.deepEqual(result.problems, []);
    assert.match(result.summary, /^1 changes touched on this branch \(track-letters\), none lost/);
  });

  it('fails a rule dropped after the base, when the proposal merged before the base', () => {
    propose();
    repo.setBase();
    repo.write({ [DELTA]: MERGED });
    repo.commit('Apply track-letters');
    const result = check();
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /^track-letters: .* lost a SHALL word since the gate/);
  });
});

describe('gate <change>', () => {
  it('prints each requirement at the gate and now, and returns the dropped rules quietly', (t) => {
    const logs = t.mock.method(console, 'log', () => {});
    propose();
    repo.write({ [DELTA]: MERGED });
    const result = run(repo.context(['track-letters']));
    assert.deepEqual(result.problems, [KEY]);
    assert.equal(result.quiet, true);
    const printed = logs.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
    assert.match(printed, /^track-letters, gate [0-9a-f]+ Propose track-letters/);
    assert.match(printed, /1 requirement lost a SHALL word and kept every scenario/);
  });

  it('throws without a change name, or with a --gate that names no commit', () => {
    propose();
    assert.throws(() => run(repo.context([])), /name a change, or pass --check/);
    assert.throws(() => run(repo.context(['track-letters', '--gate', 'nothing-here'])), /no commit nothing-here/);
  });
});

describe('changesSince and changeFolder', () => {
  it('names each change that differs from the base, archived ones by their own name', () => {
    const base = repo.git('rev-parse', 'HEAD');
    repo.write({
      'openspec/changes/add-holds/proposal.md': '## Why\n',
      'openspec/changes/archive/2026-02-03-waive-fines/proposal.md': '## Why\n',
      'openspec/changes/archive/README.md': 'not a change\n',
    });
    assert.deepEqual(changesSince(repo.root, base), ['add-holds', 'waive-fines']);
    assert.equal(changeFolder(repo.root, 'add-holds'), 'openspec/changes/add-holds');
    assert.equal(changeFolder(repo.root, 'waive-fines'), 'openspec/changes/archive/2026-02-03-waive-fines');
    assert.equal(changeFolder(repo.root, 'no-such-change'), null);
  });
});
