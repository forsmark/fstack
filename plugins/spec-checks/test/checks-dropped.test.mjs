import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { dropped, retiredBy, run } from '../lib/checks/dropped.mjs';
import { tempRepo, withEnv } from './temp-repo.mjs';

const MAIN = 'openspec/specs/loans/spec.md';
const spec = (...names) =>
  `# loans\n\n## Requirements\n\n${names.map((name) => `### Requirement: ${name}\n\nThe system SHALL do ${name}.\n\n#### Scenario: ${name}\n- **WHEN** it runs\n- **THEN** it does\n`).join('\n')}`;

// An old archived change renamed Old into New. A rename retires only the old
// name, so the new name is still held to its main spec.
const OLD_RENAME = `## RENAMED Requirements

- FROM: \`### Requirement: Old\`
- TO: \`### Requirement: New\`
`;

let repo;
let base;

beforeEach(() => {
  repo = tempRepo();
  repo.checks();
  repo.write({
    [MAIN]: spec('Kept', 'Gone', 'New'),
    'openspec/changes/archive/2026-01-01-rename/specs/loans/spec.md': OLD_RENAME,
  });
  base = repo.commit('Start');
  repo.setBase();
});

afterEach(() => repo.remove());

describe('dropped', () => {
  it('fails on a requirement removed in a commit on the branch with no delta retiring it', () => {
    repo.write({ [MAIN]: spec('Kept', 'New') });
    repo.commit('Drop a requirement');
    assert.deepEqual(dropped(repo.root, base), ['loans › Gone']);
  });

  it("does not exempt a renamed requirement's new name", () => {
    repo.write({ [MAIN]: spec('Kept', 'Gone') });
    repo.commit('Drop the renamed requirement');
    assert.deepEqual(dropped(repo.root, base), ['loans › New']);
  });

  it('still sees an uncommitted edit, as the hook does', () => {
    repo.write({ [MAIN]: spec('Kept', 'New') });
    assert.deepEqual(dropped(repo.root, base), ['loans › Gone']);
  });

  it("passes a requirement a branch's delta removes, or renames from", () => {
    repo.write({
      [MAIN]: spec('Kept', 'Newer'),
      'openspec/changes/tidy/specs/loans/spec.md': `## REMOVED Requirements\n\n### Requirement: Gone\n\n**Reason**: done.\n\n## RENAMED Requirements\n\n- FROM: \`### Requirement: New\`\n- TO: \`### Requirement: Newer\`\n`,
    });
    repo.commit('Tidy loans');
    assert.deepEqual(dropped(repo.root, base), []);
  });

  it('retires a name only in the capability its delta belongs to', () => {
    repo.write({
      [MAIN]: spec('Kept', 'New'),
      'openspec/changes/tidy/specs/fines/spec.md': `## REMOVED Requirements\n\n### Requirement: Gone\n`,
    });
    repo.commit('Remove from another spec');
    assert.deepEqual(dropped(repo.root, base), ['loans › Gone']);
  });

  it('fails on every requirement of a main spec that was deleted', () => {
    repo.write({ [MAIN]: null });
    assert.deepEqual(dropped(repo.root, base), ['loans › Kept', 'loans › Gone', 'loans › New']);
  });
});

describe('retiredBy', () => {
  it('reads the REMOVED names and only the old name of each rename', () => {
    assert.deepEqual(
      retiredBy('loans', `${OLD_RENAME}\n## REMOVED Requirements\n\n### Requirement: Gone\n`),
      ['loans › Gone', 'loans › Old'],
    );
  });
});

describe('the dropped check', () => {
  it('names each dropped requirement and says how to retire it', () => {
    repo.write({ [MAIN]: spec('Kept', 'New') });
    const result = run(repo.context());
    assert.deepEqual(result.problems, ['loans › Gone: left its main spec with no delta retiring it']);
    assert.match(result.hint, /under '## REMOVED Requirements', or as the FROM of a rename/);
  });

  it('compares with HEAD where there is no base, so an uncommitted drop still shows', () => {
    repo.git('update-ref', '-d', 'refs/remotes/origin/main');
    repo.write({ [MAIN]: spec('Kept', 'New') });
    const ctx = repo.context();
    const result = withEnv({ CI: undefined }, () => run(ctx));
    assert.deepEqual(result.problems, ['loans › Gone: left its main spec with no delta retiring it']);
    assert.match(ctx.notes[0], /^no base: none of origin\/main exists/);
  });

  it('passes and says so where no requirement left', () => {
    assert.deepEqual(run(repo.context()), {
      problems: [],
      summary: 'no requirement left a main spec without a delta',
    });
  });
});
