import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import {
  checkCoverage,
  readTests,
  readUnitTests,
  scenarioKeys,
  scenarioTexts,
  useTypeScript,
} from '../lib/plans/coverage.mjs';

useTypeScript(ts);

const SPEC = `# loans Specification

## Purpose

Something.

## Requirements

### Requirement: A loan has one due date

Text.

#### Scenario: Each branch shows the same date
- **WHEN** the due date is read

#### Scenario: A loan due on \`2026-03-01\`
- **THEN** it is

### Requirement: A renewal moves only the due date

#### Scenario: Each branch shows the same date
- **THEN** a scenario name may repeat under another requirement
`;

describe('scenarioKeys', () => {
  it('names each scenario by its capability, requirement and own name', () => {
    assert.deepEqual(scenarioKeys('loans', SPEC), [
      'loans › A loan has one due date › Each branch shows the same date',
      'loans › A loan has one due date › A loan due on `2026-03-01`',
      'loans › A renewal moves only the due date › Each branch shows the same date',
    ]);
  });
});

describe('scenarioTexts', () => {
  it('holds each scenario’s steps by its key, with no prose, heading or wrapping of its own', () => {
    const rewrapped = SPEC.replace(
      '- **WHEN** the due date is read',
      '- **WHEN** the\n  due date   is read\n',
    );
    const texts = scenarioTexts('loans', rewrapped);
    assert.deepEqual(texts, scenarioTexts('loans', SPEC));
    assert.deepEqual(Object.fromEntries(texts), {
      'loans › A loan has one due date › Each branch shows the same date': '- **WHEN** the due date is read',
      'loans › A loan has one due date › A loan due on `2026-03-01`': '- **THEN** it is',
      'loans › A renewal moves only the due date › Each branch shows the same date':
        '- **THEN** a scenario name may repeat under another requirement',
    });
  });
});

describe('checkCoverage', () => {
  const A = 'holds › The shelf › One shelf';
  const B = 'holds › The shelf › A guest';
  const C = 'holds › Suggestions › A guest';
  const D = 'fines › Fines › One fine';
  const E2E = 'e2e/tests/holds.spec.ts';
  const UNIT = 'apps/web/src/holds.test.tsx';
  const MAP_DIR = 'spec-map';
  const LIST_FILE = 'spec-map/not-yet.txt';

  /** A tree where every scenario is accounted for, with one change applied. */
  const check = (change = {}) =>
    checkCoverage({
      scenarios: [A, B, C, D],
      map: {
        holds: {
          'The shelf': {
            'One shelf': { e2e: `${E2E} › one shelf` },
            'A guest': { unit: `${UNIT} › lets a guest browse the shelf` },
          },
          Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
        },
      },
      notYet: [D],
      baseNotYet: null,
      tests: [{ file: E2E, title: 'one shelf', scenarios: [A] }],
      readUnit: (file) => (file === UNIT ? "it('lets a guest browse the shelf', () => {})" : null),
      mapDir: MAP_DIR,
      listFile: LIST_FILE,
      ...change,
    });

  it('passes when every scenario has one entry that holds', () => {
    assert.deepEqual(check(), []);
  });

  it('names a scenario with no entry, and one both mapped and not yet', () => {
    assert.deepEqual(check({ notYet: [] }), [
      `${D}: no entry. Map it in spec-map/fines.json, or cover it with a test`,
    ]);
    assert.deepEqual(check({ notYet: [D, A] }), [
      `${A}: mapped and on the not-yet list. Take it off spec-map/not-yet.txt`,
    ]);
  });

  it('names an entry or a not-yet line for a scenario no spec has', () => {
    const map = {
      holds: {
        'The shelf': {
          'One shelf': { e2e: `${E2E} › one shelf` },
          'A guest': { unit: `${UNIT} › lets a guest browse the shelf` },
          'Two shelves': { none: 'renamed since' },
        },
        Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
      },
    };
    assert.deepEqual(check({ map }), [
      'spec-map/holds.json: holds › The shelf › Two shelves is in no spec',
    ]);
    assert.deepEqual(check({ notYet: [D, 'fines › Fines › Gone'] }), [
      'spec-map/not-yet.txt: fines › Fines › Gone is in no spec',
    ]);
  });

  it('names an e2e entry whose test is missing or does not cover the scenario', () => {
    const entry = (e2e) => ({
      map: {
        holds: {
          'The shelf': {
            'One shelf': { e2e },
            'A guest': { unit: `${UNIT} › lets a guest browse the shelf` },
          },
          Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
        },
      },
    });
    assert.deepEqual(check(entry(`${E2E} › two shelves`)), [`${A}: no test ${E2E} › two shelves`]);
    assert.deepEqual(check({ tests: [{ file: E2E, title: 'one shelf', scenarios: [] }] }), [
      `${A}: ${E2E} › one shelf does not name it in covers(…)`,
    ]);
  });

  it('names a test that covers a scenario no spec has, or one still on the not-yet list', () => {
    const tests = [
      { file: E2E, title: 'one shelf', scenarios: [A, 'holds › The shelf › Gone'] },
      { file: E2E, title: 'a fine', scenarios: [D] },
    ];
    assert.deepEqual(check({ tests }), [
      `${E2E} › one shelf covers holds › The shelf › Gone, which is in no spec`,
      `${E2E} › a fine covers ${D}, which is on the not-yet list. Map it instead`,
    ]);
  });

  it('names a unit entry whose file or test is missing, and an entry with no reason or no kind', () => {
    const with_ = (guest, suggestions) => ({
      map: {
        holds: {
          'The shelf': { 'One shelf': { e2e: `${E2E} › one shelf` }, 'A guest': guest },
          Suggestions: { 'A guest': suggestions },
        },
      },
    });
    assert.deepEqual(check(with_({ unit: 'apps/x.test.ts › y' }, { none: ' ' })), [
      `${B}: no file apps/x.test.ts`,
      `${C}: "none" needs a reason`,
    ]);
    assert.deepEqual(check(with_({ unit: `${UNIT} › hides it` }, { e2e: 'x', none: 'y' })), [
      `${B}: ${UNIT} has no test named "hides it"`,
      `${C}: an entry is one of {"e2e": …}, {"unit": …} or {"none": …}, with an optional "checked"`,
    ]);
  });

  it('names a unit entry that matches two tests, and passes one named by its describe', () => {
    const source = `
      describe('a guest', () => {
        it('lets a guest browse the shelf', () => {});
      });
      describe('a member', () => {
        it('lets a guest browse the shelf', () => {});
      });
    `;
    const guest = (unit) => ({
      readUnit: (file) => (file === UNIT ? source : null),
      map: {
        holds: {
          'The shelf': { 'One shelf': { e2e: `${E2E} › one shelf` }, 'A guest': { unit } },
          Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
        },
      },
    });
    assert.deepEqual(check(guest(`${UNIT} › lets a guest browse the shelf`)), [
      `${B}: ${UNIT} has 2 tests named "lets a guest browse the shelf": "a guest › lets a guest browse the shelf", "a member › lets a guest browse the shelf". Name one by its describes, as "<file> › <describe> › <test>", or rename them apart`,
    ]);
    assert.deepEqual(check(guest(`${UNIT} › a member › lets a guest browse the shelf`)), []);
    assert.deepEqual(check(guest(`${UNIT} › a librarian › lets a guest browse the shelf`)), [
      `${B}: ${UNIT} has no test named "a librarian › lets a guest browse the shelf"`,
    ]);
  });

  it('names a unit entry outside every unit root, and passes one under a root', () => {
    assert.deepEqual(check({ unitRoots: ['apps/web/'] }), []);
    assert.deepEqual(check({ unitRoots: ['scripts', 'tools'] }), [
      `${B}: ${UNIT} is under no unit test root in openspec/checks.json: scripts, tools`,
    ]);
  });

  it('reads an e2e entry under an end-to-end root as a test runner test, and refuses a unit entry there', () => {
    const CLI = 'packages/cli/e2e/shelf.test.ts';
    const readUnit = (file) =>
      file === UNIT
        ? "it('lets a guest browse the shelf', () => {})"
        : file === CLI
          ? "it('prints the shelf', () => {})"
          : null;
    const shelf = (entry) => ({
      readUnit,
      e2eRoots: ['packages/cli/e2e'],
      tests: [],
      map: {
        holds: {
          'The shelf': { 'One shelf': entry, 'A guest': { unit: `${UNIT} › lets a guest browse the shelf` } },
          Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
        },
      },
    });
    assert.deepEqual(check(shelf({ e2e: `${CLI} › prints the shelf` })), []);
    assert.deepEqual(check(shelf({ e2e: `${CLI} › prints nothing` })), [
      `${A}: ${CLI} has no test named "prints nothing"`,
    ]);
    assert.deepEqual(check(shelf({ unit: `${CLI} › prints the shelf` })), [
      `${A}: ${CLI} is under an end-to-end test root in openspec/checks.json, so map it as {"e2e": …}`,
    ]);
    // Outside the end-to-end roots, an e2e entry still names a Playwright test.
    assert.deepEqual(check(shelf({ e2e: `${E2E} › one shelf` })), [`${A}: no test ${E2E} › one shelf`]);
  });

  it('lets the deepest root that holds a file say what kind of test it is', () => {
    const CLI = 'packages/cli/e2e/shelf.test.ts';
    const readUnit = (file) =>
      file === UNIT
        ? "it('lets a guest browse the shelf', () => {})"
        : file === CLI
          ? "it('prints the shelf', () => {})"
          : null;
    const shelf = (entry, roots) => ({
      readUnit,
      ...roots,
      map: {
        holds: {
          'The shelf': { 'One shelf': entry, 'A guest': { unit: `${UNIT} › lets a guest browse the shelf` } },
          Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
        },
      },
    });
    // An end-to-end root inside a unit root, written with ./ and a trailing slash.
    const inside = { unitRoots: ['packages', 'apps'], e2eRoots: ['./packages/cli/e2e/'] };
    assert.deepEqual(check(shelf({ e2e: `${CLI} › prints the shelf` }, inside)), []);
    assert.deepEqual(check(shelf({ unit: `${CLI} › prints the shelf` }, inside)), [
      `${A}: ${CLI} is under an end-to-end test root in openspec/checks.json, so map it as {"e2e": …}`,
    ]);
    // A unit root inside an end-to-end root.
    assert.deepEqual(
      check(shelf({ e2e: `${E2E} › one shelf` }, { unitRoots: ['./apps/web/src'], e2eRoots: ['apps'] })),
      [],
    );
    // A Playwright root inside an end-to-end root: its tests still name their scenarios in covers(…).
    const playwright = {
      e2eRoots: ['e2e'],
      playwrightRoots: ['e2e/tests'],
      tests: [{ file: E2E, title: 'one shelf', scenarios: [] }],
    };
    assert.deepEqual(check(shelf({ e2e: `${E2E} › one shelf` }, playwright)), [
      `${A}: ${E2E} › one shelf does not name it in covers(…)`,
    ]);
  });

  it('refuses a not-yet line the base did not have, and compares nothing without a base list', () => {
    assert.deepEqual(check({ baseNotYet: [D, A] }), []);
    assert.deepEqual(check({ baseNotYet: [] }), [
      `spec-map/not-yet.txt: ${D} was not on the list at the base. The list only shrinks: cover it, or map it`,
    ]);
  });
});

describe('checkCoverage, on a scenario whose text changed since the base', () => {
  const A = 'holds › The shelf › One shelf';
  const B = 'holds › The shelf › A guest';
  const C = 'holds › Suggestions › A guest';
  const E2E = 'e2e/tests/holds.spec.ts';
  const UNIT = 'apps/web/src/holds.test.tsx';
  const MAP = {
    holds: {
      'The shelf': {
        'One shelf': { e2e: `${E2E} › one shelf` },
        'A guest': { unit: `${UNIT} › lets a guest browse the shelf` },
      },
      Suggestions: { 'A guest': { none: 'a guest has no card to keep a reading list on' } },
    },
  };
  const TEXTS = new Map([
    [A, '- **THEN** one shelf shows'],
    [B, '- **THEN** a guest sees the way in'],
    [C, '- **THEN** no suggestions show'],
  ]);

  /** A branch whose base had `baseTexts`, with one change applied to the tree now. */
  const check = ({ baseTexts = TEXTS, baseMap = MAP, changed = [], ...now } = {}) =>
    checkCoverage({
      scenarios: [A, B, C],
      map: MAP,
      notYet: [],
      baseNotYet: null,
      tests: [{ file: E2E, title: 'one shelf', scenarios: [A] }],
      readUnit: (file) => (file === UNIT ? "it('lets a guest browse the shelf', () => {})" : null),
      texts: TEXTS,
      base: { texts: baseTexts, map: baseMap, changed: new Set(changed) },
      ...now,
    });

  const before = (key, text) => new Map([...TEXTS, [key, text]]);

  it('names the scenario and its test file when the test is untouched', () => {
    assert.deepEqual(check({ baseTexts: before(A, '- **THEN** two shelves show') }), [
      `${A}: its text changed since the base, and ${E2E} did not. Update the test, or say in "checked" why it already shows the new text`,
    ]);
  });

  it('passes once the test file changes, whether e2e or unit', () => {
    assert.deepEqual(check({ baseTexts: before(A, '- **THEN** two shelves'), changed: [E2E] }), []);
    assert.deepEqual(check({ baseTexts: before(B, '- **THEN** a guest'), changed: [UNIT] }), []);
    assert.deepEqual(check({ baseTexts: before(B, '- **THEN** a guest') }), [
      `${B}: its text changed since the base, and ${UNIT} did not. Update the test, or say in "checked" why it already shows the new text`,
    ]);
  });

  it('names a "none" whose reason did not change, and passes one whose reason did', () => {
    const baseTexts = before(C, '- **THEN** some suggestions show');
    assert.deepEqual(check({ baseTexts }), [
      `${C}: its text changed since the base, and its reason for "none" did not. Re-read it: change it, or say in "checked" why it still holds`,
    ]);
    const baseMap = { holds: { ...MAP.holds, Suggestions: { 'A guest': { none: 'an older reason' } } } };
    assert.deepEqual(check({ baseTexts, baseMap }), []);
  });

  /** MAP with the entry of `One shelf` and of Suggestions' `A guest` replaced. */
  const mapWith = (oneShelf, suggestions) => ({
    holds: {
      'The shelf': { ...MAP.holds['The shelf'], 'One shelf': oneShelf },
      Suggestions: { 'A guest': suggestions },
    },
  });

  it('passes an untouched test or reason whose entry gained a "checked"', () => {
    const map = mapWith(
      {
        e2e: `${E2E} › one shelf`,
        checked: 'the test counts the shelves, whatever the text calls them',
      },
      { none: 'a guest has no card to keep a reading list on', checked: 'a guest still has none' },
    );
    const baseTexts = new Map([
      [A, '- **THEN** two shelves'],
      [B, TEXTS.get(B)],
      [C, '- **THEN** some suggestions'],
    ]);
    assert.deepEqual(check({ map, baseTexts }), []);
  });

  it('refuses a "checked" written for the earlier text, even beside a changed test', () => {
    const map = mapWith(
      { e2e: `${E2E} › one shelf`, checked: 'an earlier reason' },
      MAP.holds.Suggestions['A guest'],
    );
    const problem = `${A}: its text changed since the base, and its "checked" was written for the earlier text. Remove it, or rewrite it for the new text`;
    const baseTexts = before(A, '- **THEN** two shelves');
    assert.deepEqual(check({ map, baseMap: map, baseTexts }), [problem]);
    assert.deepEqual(check({ map, baseMap: map, baseTexts, changed: [E2E] }), [problem]);
    assert.deepEqual(check({ map, baseMap: map }), []);
  });

  it('passes an entry that is new, or that names another test, since the base', () => {
    const baseTexts = before(A, '- **THEN** two shelves');
    const baseMap = mapWith(undefined, MAP.holds.Suggestions['A guest']);
    assert.deepEqual(check({ baseTexts, baseMap }), []);
    const moved = mapWith({ e2e: `${E2E} › two shelves` }, MAP.holds.Suggestions['A guest']);
    assert.deepEqual(check({ baseTexts, baseMap: moved }), []);
  });

  it('judges a renamed, added or not-yet scenario as before', () => {
    const renamed = new Map([...TEXTS].filter(([key]) => key !== A));
    renamed.set('holds › The shelf › Two shelves', '- **THEN** two shelves');
    assert.deepEqual(check({ baseTexts: renamed }), []);
    const map = {
      holds: { ...MAP.holds, 'The shelf': { 'A guest': MAP.holds['The shelf']['A guest'] } },
    };
    const baseTexts = before(A, '- **THEN** two shelves');
    assert.deepEqual(check({ map, notYet: [A], tests: [], baseTexts }), []);
  });

  it('names a "checked" with no reason', () => {
    const map = mapWith({ e2e: `${E2E} › one shelf`, checked: ' ' }, MAP.holds.Suggestions['A guest']);
    assert.deepEqual(check({ map }), [`${A}: "checked" needs a reason`]);
  });

  it('passes a branch that changes only prose outside the scenarios', () => {
    const spec = (prose) =>
      `### Requirement: The shelf\n\n${prose}\n\n#### Scenario: One shelf\n- **THEN** one shelf shows\n`;
    const baseTexts = scenarioTexts('holds', spec('The shelf SHALL show.'));
    const texts = scenarioTexts('holds', spec('The shelf SHALL always show, on every page.'));
    assert.deepEqual(
      check({ baseTexts: new Map([...TEXTS, ...baseTexts]), texts: new Map([...TEXTS, ...texts]) }),
      [],
    );
  });
});

describe('readTests', () => {
  const FILE = 'catalogue/shelf.spec.ts';

  it('reads each test’s title and the scenarios it covers, inside a describe or not', () => {
    const source = `
      import { covers, test } from '../../support/fixtures';
      test.describe('the shelf', () => {
        test('a member’s shelf', { annotation: covers('a › b › c', 'a › b › d') }, async ({ page }) => {
          test.skip(true, 'not a declaration');
          await test.step('a step', async () => {});
        });
      });
      test.fixme("no scenario yet", async () => {});
    `;
    assert.deepEqual(readTests(FILE, source), [
      { file: FILE, title: 'a member’s shelf', scenarios: ['a › b › c', 'a › b › d'] },
      { file: FILE, title: 'no scenario yet', scenarios: [] },
    ]);
  });

  it('refuses a title or a scenario it cannot read as a literal', () => {
    assert.throws(
      () => readTests(FILE, 'test(`a ${x}`, async () => {});'),
      /catalogue\/shelf.spec.ts:1: a test's title must be a literal string/,
    );
    assert.throws(
      () => readTests(FILE, "test('t', { annotation: covers(key) }, async () => {});"),
      /shelf.spec.ts:1: covers\(…\) takes literal strings only/,
    );
    assert.throws(
      () => readTests(FILE, "test('t', { annotation: [{ type: 'scenario' }] }, async () => {});"),
      /shelf.spec.ts:1: write the annotation as covers\(…\)/,
    );
  });

  it('refuses two tests of one title in a file', () => {
    assert.throws(
      () => readTests(FILE, "test('t', async () => {});\ntest('t', async () => {});"),
      /shelf.spec.ts:2: a second test titled "t"/,
    );
  });
});

describe('readUnitTests', () => {
  it('reads each test as its describes and its title, whatever form its call takes', () => {
    const source = `
      import { describe, it, test } from 'vitest';
      describe('receipt', () => {
        describe.each(['a', 'b'])('%s', () => {
          it.each([1, 2])('%s meets 4.5 to 1', () => {});
        });
        for (const receipt of receipts) {
          test(\`\${receipt.name} links the catalogue\`, () => {});
        }
        it.todo("waits");
      });
      it(name, () => {});
      expect('not a test').toBe('x');
    `;
    assert.deepEqual(readUnitTests('apps/x.test.tsx', source), [
      ['receipt', '%s', '%s meets 4.5 to 1'],
      ['receipt', '${receipt.name} links the catalogue'],
      ['receipt', 'waits'],
    ]);
  });
});
