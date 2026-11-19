import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkShall, listLine, report, requirementsOf } from '../lib/plans/shall.mjs';

const SPEC = `# loans Specification

## Requirements

### Requirement: A loan lasts three weeks

A loan SHALL last three weeks. The first renewal SHALL add \`21\` days. The member SHALL pay no fee.

#### Scenario: A book is borrowed
- **THEN** it is due in three weeks

### Requirement: A loan is renewed once

A member SHALL renew a loan at most once.

#### Scenario: A first renewal
- **THEN** the loan is renewed

#### Scenario: A second renewal
- **THEN** it is refused
`;

const LIST_FILE = 'openspec/shall-gaps.txt';
const LASTS = 'loans › A loan lasts three weeks';
const requirements = requirementsOf('loans', SPEC);

describe('requirementsOf', () => {
  it('counts the SHALL sentences beyond the scenarios, and never fewer than none', () => {
    assert.deepEqual(
      requirements.map(({ key, scenarios, excess }) => ({ key, scenarios, excess })),
      [
        { key: LASTS, scenarios: 1, excess: 2 },
        { key: 'loans › A loan is renewed once', scenarios: 2, excess: 0 },
      ],
    );
    assert.equal(listLine(requirements[0]), `${LASTS} › 2`);
  });
});

describe('checkShall', () => {
  const check = (notYet, baseNotYet = null) =>
    checkShall({ requirements, notYet, baseNotYet, listFile: LIST_FILE });

  it('passes a gap the list holds at its count', () => {
    assert.deepEqual(check([`${LASTS} › 2`], [`${LASTS} › 2`]), []);
  });

  it('reports a gap the list does not hold, with its sentences', () => {
    const [problem, ...rest] = check([]);
    assert.deepEqual(rest, []);
    assert.match(problem, /^loans › A loan lasts three weeks: 3 SHALL sentences and 1 scenarios:/);
    assert.match(problem, /- The member SHALL pay no fee\./);
    assert.match(problem, /Do not merge two SHALL sentences or turn a rule into prose to meet the count\.$/);
  });

  it('reports a gap that grew beyond its count on the list', () => {
    assert.equal(check([`${LASTS} › 1`]).length, 1);
  });

  it('asks for a rewrite where a gap shrank or closed, or its requirement is gone', () => {
    assert.match(
      check([`${LASTS} › 3`])[0],
      /^openspec\/shall-gaps\.txt: loans › A loan lasts three weeks is listed at 3, and is now 2\. Run/,
    );
    assert.match(
      check([`${LASTS} › 2`, 'loans › A loan is renewed once › 1'])[0],
      /listed at 1, and is now 0/,
    );
    assert.match(check([`${LASTS} › 2`, 'loans › Gone › 1'])[0], /Gone is in no spec/);
  });

  it('refuses a line that cannot be read, or is listed twice', () => {
    assert.match(check([`${LASTS} › 2`, 'no count'])[0], /"no count" is not/);
    assert.match(check([`${LASTS} › 2`, `${LASTS} › 2`])[0], /listed twice/);
  });

  it('refuses a gap that was not on the list at the base, or was smaller there', () => {
    assert.match(check([`${LASTS} › 2`], [])[0], /was at 0 at the base\. The list only shrinks/);
    assert.match(check([`${LASTS} › 2`], [`${LASTS} › 1`])[0], /was at 1 at the base/);
  });

  describe('a requirement renamed through OpenSpec', () => {
    const OLD = 'loans › A loan lasted three weeks';
    const renames = [{ from: OLD, to: LASTS }];
    const renamed = (notYet, baseNotYet) =>
      checkShall({ requirements, notYet, baseNotYet, renames, listFile: LIST_FILE });

    it('carries its gap to its new name, at the same count or a lower one', () => {
      assert.deepEqual(renamed([`${LASTS} › 2`], [`${OLD} › 2`]), []);
      assert.deepEqual(renamed([`${LASTS} › 2`], [`${OLD} › 3`]), []);
    });

    it('fails where the rename grows the gap', () => {
      assert.match(
        renamed([`${LASTS} › 2`], [`${OLD} › 1`])[0],
        /was at 1 as loans › A loan lasted three weeks at the base\. The list only shrinks/,
      );
    });

    it('fails as a new gap where no delta names the rename', () => {
      assert.match(check([`${LASTS} › 2`], [`${OLD} › 2`])[0], /was at 0 at the base/);
    });
  });
});

describe('report', () => {
  it('lists each gap under its spec, with its sentences', () => {
    assert.deepEqual(report(requirements), [
      'loans:',
      '  A loan lasts three weeks: 3 SHALL sentences and 1 scenarios:\n' +
        '    - A loan SHALL last three weeks.\n' +
        '    - The first renewal SHALL add `21` days.\n' +
        '    - The member SHALL pay no fee.',
    ]);
  });
});
