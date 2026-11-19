import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimsSharingTerms,
  readClaims,
  readShallSentences,
  readTerms,
  requirementsSharingTerms,
  termsIn,
  touchedRequirements,
  verbOf,
  vocabulary,
  weights,
} from '../lib/plans/claims.mjs';

const GLOSSARY = `# Library

## Language

**Title**:
One book in the catalogue.
_Avoid_: item

**Member**:
One person's library card.

**Branch**:
A library building.

**Branch manager**:
The person who runs one Branch.

**Penalty**:
A count of late returns.

**New**:
A badge.

**Card number**:
What a Member is known by.
`;

const TERMS = readTerms(GLOSSARY);

describe('readTerms', () => {
  it('reads each defined term, the longest first so it can hide a shorter one', () => {
    assert.deepEqual(TERMS, [
      'Branch manager',
      'Card number',
      'Penalty',
      'Member',
      'Branch',
      'Title',
      'New',
    ]);
  });
});

describe('termsIn', () => {
  it('finds a term in the plural', () => {
    assert.deepEqual(termsIn('Two Members and the Penalties of three Titles', TERMS), [
      'Member',
      'Penalty',
      'Title',
    ]);
  });

  it('matches a one-word term only capitalised, so prose that says new is no New', () => {
    assert.deepEqual(termsIn('a new title for a member', TERMS), []);
  });

  it('matches a longer term in any case, and lets it hide the shorter term inside it', () => {
    assert.deepEqual(termsIn('its card number and a Branch manager', TERMS), [
      'Branch manager',
      'Card number',
    ]);
  });
});

describe('vocabulary', () => {
  it('holds the terms and the stems of the longer words, without the terms’ words again', () => {
    assert.deepEqual(
      [...vocabulary('A Member SHALL store what is stored about the Titles', TERMS)].sort(),
      ['Member', 'Title', 'stor'],
    );
  });
});

describe('verbOf', () => {
  it('reads the word a SHALL governs, past NOT and be', () => {
    assert.equal(verbOf('A Member SHALL store its name'), 'store');
    assert.equal(verbOf('A field SHALL NOT be stored on the Member'), 'stored');
    assert.equal(verbOf('No request SHALL reveal the number'), 'reveal');
  });

  it('reads none where the word says too little', () => {
    assert.equal(verbOf('A Branch manager SHALL have:'), null);
  });
});

const SPEC = `# holds Specification

## Requirements

### Requirement: Hold counts stay private

A Member SHALL see their own holds. No request SHALL reveal the number of
Members holding a Title. Here the system
SHALL keep it.

#### Scenario: No count anywhere
- **WHEN** a Title is requested by any route
- **THEN** no part of the reply counts the Members holding it

### Requirement: A Member record has fixed fields

A Member record SHALL keep only these fields:

- its name
- its Penalty of late returns

The text goes on.

- A list item SHALL NOT name any Title.
`;

const HOLD_COUNTS = 'Hold counts stay private';
const FIXED_FIELDS = 'A Member record has fixed fields';
const NO_COUNT = 'No request SHALL reveal the number of Members holding a Title.';

describe('readClaims', () => {
  const claims = readClaims('holds', SPEC, TERMS);

  it('takes each SHALL sentence holding a sweeping word, with its requirement and terms', () => {
    assert.deepEqual(
      claims.map((claim) => [claim.requirement, claim.sentence, claim.terms]),
      [
        [HOLD_COUNTS, NO_COUNT, ['Member', 'Title']],
        [FIXED_FIELDS, 'A Member record SHALL keep only these fields:', ['Member', 'Penalty']],
        [FIXED_FIELDS, 'A list item SHALL NOT name any Title.', ['Title']],
      ],
    );
  });

  it('carries the list a complete-list sentence introduces, and counts it', () => {
    assert.equal(claims[1].items, 2);
    assert.ok(claims[1].vocabulary.has('Penalty'));
    assert.equal(claims[2].items, 0);
  });

  it('takes no sentence from a scenario', () => {
    assert.ok(claims.every((claim) => !claim.sentence.includes('route')));
  });
});

const OTHER = `# reading-history Specification

## Requirements

### Requirement: The last title read is kept

The last title read SHALL be stored on the Member.

### Requirement: The desk greets a Member

Every branch SHALL show a Member its name and join date at the desk.
`;

describe('claimsSharingTerms', () => {
  const claims = [
    ...readClaims('holds', SPEC, TERMS),
    ...readClaims('branches', '### Requirement: Managers\n\nEvery Branch manager SHALL retire.\n', TERMS),
  ];
  const sentences = [
    ...readShallSentences('holds', SPEC, TERMS),
    ...readShallSentences('reading-history', OTHER, TERMS),
  ];
  const weight = weights(sentences.map((sentence) => sentence.vocabulary));

  it('lists the claims of other specs that share a term, closest first', () => {
    const change = {
      requirements: ['staff-desk › The desk lists the Titles'],
      vocabulary: vocabulary('The desk SHALL show the number of Members holding a Title.', TERMS),
    };
    const matches = claimsSharingTerms({ change, claims, weight, terms: TERMS });
    assert.equal(matches[0].claim.sentence, NO_COUNT);
    assert.deepEqual(matches[0].terms, ['Member', 'Title']);
    assert.ok(matches.every((match) => match.claim.capability !== 'branches'));
  });

  it('leaves out the claims of the requirements the change touches, and keeps the rest of their spec', () => {
    const change = {
      requirements: [`holds › ${FIXED_FIELDS}`],
      vocabulary: vocabulary('A Member SHALL see a Title', TERMS),
    };
    assert.deepEqual(
      claimsSharingTerms({ change, claims, weight, terms: TERMS }).map((match) => match.claim.requirement),
      [HOLD_COUNTS],
    );
  });
});

describe('requirementsSharingTerms', () => {
  const sentences = readShallSentences('reading-history', OTHER, TERMS);
  const weight = weights(sentences.map((sentence) => sentence.vocabulary));
  const [claim] = readClaims(
    'members',
    `### Requirement: ${FIXED_FIELDS}\n\nA Member SHALL store its name and its join date, and nothing else.\n`,
    TERMS,
  );

  it('puts a requirement that uses the claim’s verb beside its term first, as one storing a field on a Member', () => {
    const matches = requirementsSharingTerms({ claim, requirements: sentences, weight, terms: TERMS });
    assert.deepEqual(
      matches.map((match) => [match.key, match.verb]),
      [
        ['reading-history › The last title read is kept', true],
        ['reading-history › The desk greets a Member', false],
      ],
    );
  });

  it('leaves out the requirements excluded', () => {
    assert.deepEqual(
      requirementsSharingTerms({
        claim,
        requirements: sentences,
        weight,
        terms: TERMS,
        exclude: ['reading-history › The last title read is kept'],
      }).map((match) => match.key),
      ['reading-history › The desk greets a Member'],
    );
  });

  it('leaves out the claim’s own spec, unless asked to keep its other requirements', () => {
    const own = [
      ...sentences,
      ...readShallSentences(
        'members',
        `### Requirement: ${FIXED_FIELDS}\n\nA Member SHALL store its name.\n\n### Requirement: A Member has a join date\n\nA Member SHALL store its join date.\n`,
        TERMS,
      ),
    ];
    const keys = (ownSpec) =>
      requirementsSharingTerms({ claim, requirements: own, weight, terms: TERMS, ownSpec }).map(
        (match) => match.key,
      );
    assert.ok(!keys(false).some((key) => key.startsWith('members')));
    assert.ok(keys(true).includes('members › A Member has a join date'));
    assert.ok(!keys(true).includes(`members › ${FIXED_FIELDS}`));
  });
});

describe('touchedRequirements', () => {
  it('names each requirement a delta spec holds, and a renamed one under both names', () => {
    const delta = `## RENAMED Requirements

- FROM: \`### Requirement: A Member record has fixed fields\`
- TO: \`### Requirement: A Member record has fixed fields and a join date\`

## MODIFIED Requirements

### Requirement: A Member record has fixed fields and a join date

A Member SHALL store its join date.

## REMOVED Requirements

### Requirement: A Member has a nickname

**Reason**: gone.
`;
    assert.deepEqual(touchedRequirements('members', delta).sort(), [
      'members › A Member has a nickname',
      'members › A Member record has fixed fields',
      'members › A Member record has fixed fields and a join date',
    ]);
  });
});
