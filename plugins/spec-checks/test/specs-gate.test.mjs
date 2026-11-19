import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareDeltas, designChange, droppedRules, overrides, printout, shallWords } from '../lib/specs/gate.mjs';

const requirement = (body, scenarios = 1) =>
  `### Requirement: R\n\n${body}\n${'\n#### Scenario: S\n- **THEN** it holds\n'.repeat(scenarios)}`;

describe('shallWords', () => {
  it('counts each SHALL, SHALL NOT once, and none in a fenced block or a scenario', () => {
    const text = `## ADDED Requirements\n\n${requirement('It SHALL go. It SHALL NOT stop, and SHALL wait.\n\n```\nSHALL\n```')}`;
    const entries = compareDeltas(new Map(), new Map([['c', text]]));
    assert.equal(entries[0].now.shall, 3);
    assert.equal(shallWords({ body: ['The word shall is no SHALL.'] }), 1);
  });
});

describe('compareDeltas and droppedRules', () => {
  const at = (body, scenarios) => new Map([['c', requirement(body, scenarios)]]);

  it('names a requirement that lost a SHALL word and kept every scenario', () => {
    const entries = compareDeltas(at('A SHALL x. B SHALL y.', 1), at('A SHALL x, and y.', 1));
    assert.equal(entries[0].status, 'changed');
    assert.deepEqual(
      droppedRules(entries, new Set()).map(({ key }) => key),
      ['c › R'],
    );
  });

  it('passes one that lost a scenario with the rule, or gained a SHALL', () => {
    assert.deepEqual(
      droppedRules(compareDeltas(at('A SHALL x. B SHALL y.', 2), at('A SHALL x.', 1)), new Set()),
      [],
    );
    assert.deepEqual(
      droppedRules(compareDeltas(at('A SHALL x.', 1), at('A SHALL x. B SHALL y.', 1)), new Set()),
      [],
    );
  });

  it('names a requirement gone from the delta when it had no scenario to lose', () => {
    const entries = compareDeltas(at('A SHALL x.', 0), new Map());
    assert.equal(entries[0].status, 'removed');
    assert.equal(droppedRules(entries, new Set()).length, 1);
  });

  it('passes a requirement the override names, with or without its capability', () => {
    const entries = compareDeltas(at('A SHALL x. B SHALL y.', 1), at('A SHALL x.', 1));
    assert.deepEqual(droppedRules(entries, new Set(['R'])), []);
    assert.deepEqual(droppedRules(entries, new Set(['c › R'])), []);
  });
});

describe('overrides', () => {
  it('reads the list items under its heading, each with a reason', () => {
    const proposal = `## Why\n\n- Elsewhere: not an override\n\n## Rules dropped after the proposal\n\n- \`A rule\`: a reason\n- No reason:\n\n## Impact\n\n- Later: not one either\n`;
    assert.deepEqual([...overrides(proposal)], ['A rule']);
  });
});

describe('designChange', () => {
  it('tells an addition that keeps the gate text from a rewrite', () => {
    assert.equal(designChange('a\nb\n', 'a\nb\n').status, 'unchanged');
    assert.equal(
      designChange('a\nb\n', 'a\nb\n\n## Changed during apply\n\nc\n').status,
      'added to',
    );
    assert.deepEqual(designChange('a\nb\n', 'a\nc\n'), { status: 'rewritten', lost: ['b'] });
  });
});

describe('printout', () => {
  it('lists the unchanged requirements, and says when none lost a rule', () => {
    const entries = compareDeltas(new Map([['c', requirement('A SHALL x.')]]), new Map([['c', requirement('A SHALL x.')]]));
    const text = printout({ entries, design: designChange('a', 'a'), problems: [] });
    assert.match(text, /design\.md: unchanged since the gate/);
    assert.match(text, /1 requirement unchanged since the gate:\n {2}c › R/);
    assert.match(text, /No requirement lost a SHALL word while it kept every scenario\./);
  });

  it('shows the lines a rewritten design.md lost', () => {
    const text = printout({ entries: [], design: designChange('a\nb\n', 'a\nc\n'), problems: [] });
    assert.match(text, /design\.md: rewritten since the gate\. These lines of the gate's text are gone:\n {4}- b/);
  });
});
