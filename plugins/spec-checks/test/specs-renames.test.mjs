import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { nameAtBase, readRenames, renamesSince } from '../lib/specs/renames.mjs';
import { tempRepo } from './temp-repo.mjs';

const DELTA = `## RENAMED Requirements

- FROM: \`### Requirement: A Fine waiver is silent\`
- TO: \`### Requirement: A waiver is silent\`

### From: Requirement: Old heading form
### To: Requirement: New heading form

## MODIFIED Requirements

- FROM: \`### Requirement: Not a rename here\`
- TO: \`### Requirement: Outside the block\`
`;

// A delta as \`openspec archive\` leaves it in the archive: renames, then the modified text.
const ARCHIVED = `## RENAMED Requirements

- FROM: \`### Requirement: A librarian can waive a member's Fine\`
- TO: \`### Requirement: A librarian can waive or reduce a member's Fine\`

- FROM: \`### Requirement: A Fine waiver is silent\`
- TO: \`### Requirement: A waiver is silent\`

## MODIFIED Requirements

### Requirement: A librarian can waive or reduce a member's Fine

A librarian SHALL be able to waive a Fine, or reduce it to a lower sum.

#### Scenario: A reduced Fine
- **WHEN** a librarian reduces a Fine of 40 to 10
- **THEN** the member owes 10
`;

describe('readRenames', () => {
  it('reads each FROM and TO of the RENAMED block as requirement keys', () => {
    assert.deepEqual(readRenames('fines', DELTA), [
      { from: 'fines › A Fine waiver is silent', to: 'fines › A waiver is silent' },
      { from: 'fines › Old heading form', to: 'fines › New heading form' },
    ]);
  });

  it('reads the renames of an archived change as OpenSpec wrote them', () => {
    assert.deepEqual(readRenames('fines', ARCHIVED)[0], {
      from: "fines › A librarian can waive a member's Fine",
      to: "fines › A librarian can waive or reduce a member's Fine",
    });
  });
});

describe('nameAtBase', () => {
  const renames = [
    { from: 'c › A', to: 'c › B' },
    { from: 'c › B', to: 'c › C' },
  ];

  it('follows renames back to the name the base had', () => {
    assert.equal(
      nameAtBase('c › C', renames, (key) => key === 'c › A'),
      'c › A',
    );
  });

  it('keeps a name no rename names, and stops at a loop', () => {
    assert.equal(
      nameAtBase('c › D', renames, () => false),
      'c › D',
    );
    const loop = [
      { from: 'c › X', to: 'c › Y' },
      { from: 'c › Y', to: 'c › X' },
    ];
    assert.equal(
      nameAtBase('c › X', loop, () => false),
      'c › Y',
    );
  });
});

describe('renamesSince', () => {
  let repo;
  beforeEach(() => {
    repo = tempRepo();
    repo.write({ 'README.md': 'start\n' });
    repo.commit('Start');
  });
  afterEach(() => repo.remove());

  it('reads the renames of the deltas that differ from the base, committed or not', () => {
    const base = repo.git('rev-parse', 'HEAD');
    repo.write({ 'openspec/changes/waive-more/specs/fines/spec.md': ARCHIVED });
    repo.commit('Propose waive-more');
    repo.write({ 'openspec/changes/rename-old/specs/fines/spec.md': DELTA });
    assert.deepEqual(
      renamesSince(repo.root, base).map(({ from }) => from),
      [
        'fines › A Fine waiver is silent',
        'fines › Old heading form',
        "fines › A librarian can waive a member's Fine",
        'fines › A Fine waiver is silent',
      ],
    );
  });

  it('skips a delta that the branch archived away, and reads it where it went', () => {
    repo.write({ 'openspec/changes/waive-more/specs/fines/spec.md': ARCHIVED });
    repo.commit('Propose waive-more');
    const base = repo.git('rev-parse', 'HEAD');
    repo.write({
      'openspec/changes/waive-more': null,
      'openspec/changes/archive/2026-03-02-waive-more/specs/fines/spec.md': ARCHIVED,
    });
    repo.commit('Archive waive-more');
    assert.equal(renamesSince(repo.root, base).length, 2);
  });
});
