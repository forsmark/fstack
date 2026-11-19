import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkLong, longKeys, readIssues } from '../lib/plans/long.mjs';

const LONG_MESSAGE =
  'Requirement text is very long (>500 characters). Move examples and edge cases into scenarios.';

const LIST_FILE = 'openspec/long-not-yet.txt';
const NAMES = { loans: ['A loan lasts three weeks', 'A loan is renewed once', 'Overdue loans are listed'] };
const namesOf = (capability) => NAMES[capability] ?? [];
const KEYS = NAMES.loans.map((name) => `loans › ${name}`);
const [LASTS, RENEWED] = KEYS;

const report = (...issues) => ({ items: [{ id: 'loans', type: 'spec', valid: false, issues }] });
const long = (index) => ({
  level: 'WARNING',
  path: `requirements[${index}]`,
  message: LONG_MESSAGE,
});

describe('readIssues', () => {
  it('names a requirement by its spec and its name, not its index', () => {
    const issues = readIssues(report(long(1)), namesOf);
    assert.equal(issues[0].key, RENEWED);
    assert.equal(issues[0].long, true);
    assert.deepEqual(longKeys(issues), [RENEWED]);
  });

  it('keeps an issue whose path names no requirement, with no key', () => {
    const [issue] = readIssues(
      report({ level: 'ERROR', path: 'file', message: 'Spec must have a Purpose section' }),
      namesOf,
    );
    assert.equal(issue.key, null);
    assert.equal(issue.long, false);
  });
});

describe('checkLong', () => {
  const check = (issues, notYet, baseNotYet = null) =>
    checkLong({
      issues: readIssues(report(...issues), namesOf),
      keys: KEYS,
      notYet,
      baseNotYet,
      listFile: LIST_FILE,
    });

  it('passes a long requirement the list holds, and the list as it was at the base', () => {
    assert.deepEqual(check([long(0)], [LASTS], [LASTS]), []);
  });

  it('reports a long requirement the list does not hold, by spec and name', () => {
    const [problem, ...rest] = check([long(0)], []);
    assert.deepEqual(rest, []);
    assert.match(problem, /^loans › A loan lasts three weeks: .* over 500 characters/);
  });

  it('reports every other issue, whatever the list holds', () => {
    const problems = check(
      [
        { level: 'ERROR', path: 'requirements[2]', message: 'Requirement must have a scenario' },
        { level: 'WARNING', path: 'file', message: 'Purpose is too brief' },
      ],
      [],
    );
    assert.deepEqual(problems, [
      'loans › Overdue loans are listed: [ERROR] Requirement must have a scenario',
      'loans file: [WARNING] Purpose is too brief',
    ]);
  });

  it('reports a line added since the base, under the list file the config names', () => {
    const problems = check([long(0), long(1)], [LASTS, RENEWED], [LASTS]);
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^openspec\/long-not-yet\.txt: loans › A loan is renewed once was not on the list at the base\. The list only shrinks/,
    );
  });

  it('reports a listed requirement that is no longer long', () => {
    const problems = check([], [LASTS], [LASTS]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /A loan lasts three weeks is no longer long/);
  });

  it('reports a line that names no requirement, such as a renamed one', () => {
    const problems = check([long(0)], [LASTS, 'loans › Gone'], [LASTS, 'loans › Gone']);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /loans › Gone is in no spec/);
  });

  it('reports a line listed twice', () => {
    const problems = check([long(0)], [LASTS, LASTS], [LASTS]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /listed twice/);
  });
});
