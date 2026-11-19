import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkCopies,
  commaLists,
  findCopies,
  listLine,
  listsOf,
  normalise,
  readLists,
} from '../lib/plans/repeated.mjs';

// Two specs that both list the settings a Member picks.
const MEMBERS = `# members Specification

## Requirements

### Requirement: A Member record holds only its card details

A PIN SHALL never be kept. A Member record SHALL hold its card number, its join
date and the settings it picked — its overdue preference, its newsletter
preference, its renewal preference and its catalogue news choice — and SHALL
hold nothing more.

#### Scenario: A Member record is read
- **WHEN** a librarian opens a Member record
- **THEN** it shows its card number, its join date, its overdue preference, its newsletter preference, its renewal preference, its catalogue news choice, and no more
`;

const SETTINGS = `# member-settings Specification

## Requirements

### Requirement: Each letter preference starts at a default

Every letter preference SHALL start at a default.

#### Scenario: A Member signs up
- **WHEN** a Member signs up at the desk
- **THEN** its overdue preference is *daily*, its renewal preference and its hold preference are *on*, its catalogue news choice is *In the footer*, its receipt preference is *off*, and its newsletter preference is *monthly*
`;

const BRANCHES = `# branch-hours Specification

## Requirements

### Requirement: The branches are fixed

The branches SHALL be Northside, Old Town and Harbour.
`;

const LIST_FILE = 'openspec/copies-not-yet.txt';
const FIELDS = 'members › A Member record holds only its card details';
const DEFAULTS = 'member-settings › Each letter preference starts at a default';
const COPY = `${DEFAULTS} ⇄ ${FIELDS}`;

describe('normalise', () => {
  it('drops markup, determiners and the value after the item', () => {
    assert.equal(normalise('its overdue preference is *daily*'), 'overdue preference');
    assert.equal(normalise('the `Catalogue news` choice.'), 'catalogue news choice');
  });
});

describe('commaLists', () => {
  it('reads a list ended by and, with an Oxford comma or without', () => {
    assert.deepEqual(commaLists('It holds three: the Loans, the Holds and the Fines.'), [
      ['loans', 'holds', 'fines'],
    ]);
    assert.deepEqual(commaLists('Its branches: Northside, Old Town, and Harbour.'), [
      ['northside', 'old town', 'harbour'],
    ]);
  });

  it('keeps an and inside an item, and stops a list at a clause', () => {
    assert.deepEqual(
      commaLists('Each carries: its first and last page, its shelf, its call number.'),
      [['first and last page', 'shelf', 'call number']],
    );
    assert.deepEqual(commaLists('A Member, whether new or returning, is greeted.'), []);
  });
});

describe('readLists', () => {
  it('reads a bulleted list of things, and no list in a WHEN step', () => {
    const lists = readLists([
      '- *New titles*: what arrived',
      '- *Lost items*, what went missing',
      '- *Other letters*',
      '',
      '- **WHEN** it opens the catalogue, the menu and the footer',
    ]);
    assert.deepEqual(
      lists.map((list) => list.items),
      [['new titles', 'lost items', 'other letters']],
    );
  });

  it('reads no bulleted list where an item is a sentence', () => {
    assert.deepEqual(
      readLists([
        '- a Member whose overdue preference says daily gets both letters',
        '- Northside',
        '- Harbour',
      ]),
      [],
    );
  });
});

describe('findCopies', () => {
  const lists = [
    ...listsOf('members', MEMBERS),
    ...listsOf('member-settings', SETTINGS),
    ...listsOf('branch-hours', BRANCHES),
  ];

  it('finds the list of Member settings in two specs', () => {
    const [copy] = findCopies(lists);
    assert.equal(copy.key, COPY);
    assert.deepEqual(copy.shared.toSorted(), [
      'catalogue news choice',
      'newsletter preference',
      'overdue preference',
      'renewal preference',
    ]);
    assert.equal(listLine(copy), `${COPY} › 4`);
  });

  it('reports no copy within one spec, as a requirement and its own scenario', () => {
    assert.deepEqual(
      findCopies(listsOf('members', MEMBERS)).map((copy) => copy.key),
      [],
    );
  });
});

describe('checkCopies', () => {
  const copies = findCopies([
    ...listsOf('members', MEMBERS),
    ...listsOf('member-settings', SETTINGS),
  ]);
  const line = `${COPY} › 4`;
  const check = (options) => checkCopies({ listFile: LIST_FILE, ...options });

  it('passes a copy the list holds, and the base held', () => {
    assert.deepEqual(check({ copies, notYet: [line], baseNotYet: [line] }), []);
  });

  it('fails a new copy, showing both lists', () => {
    const [problem] = check({ copies, notYet: [], baseNotYet: [] });
    assert.match(problem, /4 items in both: .*catalogue news choice/);
    assert.match(problem, /refer to it from the other by name and requirement/);
  });

  it('fails a copy added to the list since the base, or grown since', () => {
    const [added] = check({ copies, notYet: [line], baseNotYet: [] });
    assert.match(added, /listed at 4, and was at 0 at the base/);
    const [grown] = check({ copies, notYet: [line], baseNotYet: [`${COPY} › 3`] });
    assert.match(grown, /listed at 4, and was at 3 at the base/);
  });

  it('fails a line for a copy that is gone, so the list shrinks with the specs', () => {
    assert.deepEqual(check({ copies: [], notYet: [line], baseNotYet: [line] }), [
      `${LIST_FILE}: ${COPY} is listed at 4, and is now no copy. Run spec-checks repeated --write`,
    ]);
  });

  it('carries the line of a renamed requirement to its new name', () => {
    const renamed = `${DEFAULTS} ⇄ members › A Member stores its choices`;
    const moved = copies.map((copy) => ({ ...copy, key: renamed }));
    const renames = [{ from: FIELDS, to: 'members › A Member stores its choices' }];
    assert.deepEqual(
      check({ copies: moved, notYet: [`${renamed} › 4`], baseNotYet: [line], renames }),
      [],
    );
    assert.equal(check({ copies: moved, notYet: [`${renamed} › 4`], baseNotYet: [line] }).length, 1);
  });

  it('fails a line it cannot read', () => {
    assert.match(
      check({ copies, notYet: [line, 'not a line'], baseNotYet: [line] })[0],
      /"not a line" is not/,
    );
  });
});
