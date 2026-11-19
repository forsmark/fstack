import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readRequirements, sentences, shallSentences } from '../lib/specs/requirements.mjs';

const SPEC = `# loans Specification

## Purpose

The Purpose SHALL count for no requirement.

## Requirements

### Requirement: A member sees their loans

The list SHALL show Loans, e.g. ones that are
late. Some MAY be hidden.

- Only *open* loans SHALL count. A *closed* loan SHALL
  NOT appear.
- A Hold on a Title SHALL add nothing
- Each branch SHALL show the same list

\`\`\`
A code block SHALL NOT count.
\`\`\`

#### Scenario: A member borrows nothing
- **THEN** the list is empty, and this SHALL count for no sentence

### Requirement: A requirement with no rule

Prose only.
`;

describe('readRequirements', () => {
  it('reads each requirement with its body and its scenarios', () => {
    const [list, rule] = readRequirements('loans', SPEC);
    assert.equal(list.key, 'loans › A member sees their loans');
    assert.deepEqual(
      list.scenarios.map((scenario) => scenario.key),
      ['loans › A member sees their loans › A member borrows nothing'],
    );
    assert.ok(list.body.includes('- Each branch SHALL show the same list'));
    assert.equal(rule.name, 'A requirement with no rule');
    assert.deepEqual(rule.scenarios, []);
  });
});

describe('sentences', () => {
  it('ends a sentence at a full stop before a capital, not at an abbreviation', () => {
    assert.deepEqual(
      sentences(['It SHALL show, e.g. ones that are', 'late. Some MAY be hidden.']),
      ['It SHALL show, e.g. ones that are late.', 'Some MAY be hidden.'],
    );
  });

  it('ends a sentence after closing marks', () => {
    assert.deepEqual(sentences(['It reads *done.* Then `x.` Next.']), [
      'It reads *done.*',
      'Then `x.`',
      'Next.',
    ]);
  });
});

describe('shallSentences', () => {
  it('takes the SHALL and SHALL NOT sentences of the body, each list item its own', () => {
    const [list, rule] = readRequirements('loans', SPEC);
    assert.deepEqual(shallSentences(list), [
      'The list SHALL show Loans, e.g. ones that are late.',
      'Only *open* loans SHALL count.',
      'A *closed* loan SHALL NOT appear.',
      'A Hold on a Title SHALL add nothing',
      'Each branch SHALL show the same list',
    ]);
    assert.deepEqual(shallSentences(rule), []);
  });
});
