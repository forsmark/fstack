/**
 * The claims command end to end, on a temp project with its own specs and
 * glossary. Each change is written under openspec/changes.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { main } from '../lib/cli.mjs';
import { run } from '../lib/checks/claims.mjs';
import { tempRepo } from './temp-repo.mjs';

const GLOSSARY = `# Library

**Title**:
One book in the catalogue.

**Member**:
One person's library card.

**Branch**:
A library building.
`;

const requirement = (name, rule) =>
  `### Requirement: ${name}\n\n${rule}\n\n#### Scenario: ${name} holds\n- **WHEN** it is checked\n- **THEN** it holds\n`;
const spec = (capability, ...requirements) =>
  `# ${capability} Specification\n\n## Requirements\n\n${requirements.join('\n')}`;

const SPECS = {
  'openspec/specs/holds/spec.md': spec(
    'holds',
    requirement('A Member sees their own holds', 'A Member SHALL see their own holds.'),
    requirement('Hold counts stay private', 'No request SHALL reveal the number of Members holding a Title.'),
  ),
  'openspec/specs/members/spec.md': spec(
    'members',
    requirement('A Member record has fixed fields', 'A Member SHALL store its name and its join date, and nothing else.'),
  ),
  'openspec/specs/reading-history/spec.md': spec(
    'reading-history',
    requirement('The last title read is kept', 'The last title read SHALL be stored on the Member.'),
  ),
  'openspec/specs/branch-pages/spec.md': spec(
    'branch-pages',
    requirement("A Member's home Branch is kept", 'The home Branch SHALL be stored on the Member.'),
  ),
  'openspec/specs/member-settings/spec.md': spec(
    'member-settings',
    requirement('Each letter choice is kept', 'Each letter choice SHALL be stored on the Member.'),
  ),
  'openspec/specs/staff-desk/spec.md': spec(
    'staff-desk',
    requirement('The desk lists the Titles', 'The desk SHALL list every stored Title.'),
  ),
};

let repo;
beforeEach(() => {
  repo = tempRepo();
  repo.checks({ glossary: 'GLOSSARY.md' });
  repo.write({ 'GLOSSARY.md': GLOSSARY, ...SPECS });
});
afterEach(() => repo.remove());

/** A change holding one delta spec, and what claims prints for it. */
function claimsOn(t, name, capability, delta, { byPath = false } = {}) {
  const folder = `openspec/changes/${name}`;
  repo.write({ [`${folder}/specs/${capability}/spec.md`]: delta });
  const logs = t.mock.method(console, 'log', () => {});
  const result = run(repo.context([byPath ? join(repo.root, folder) : name]));
  logs.mock.restore();
  assert.deepEqual(result, { problems: [], summary: null });
  return logs.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
}

/** The lines of one part of the output, from its heading to the next. */
const part = (stdout, heading) =>
  stdout
    .split(/\n(?=\S.*: \d)/)
    .find((section) => section.startsWith(heading))
    ?.split('\n') ?? [];

describe('claims on a change', () => {
  it('shows a change to the desk that counts holds the claim that no request reveals the count', (t) => {
    const stdout = claimsOn(
      t,
      'desk-counts-holds',
      'staff-desk',
      `## MODIFIED Requirements

### Requirement: The desk lists the Titles

The desk SHALL list every stored Title, with the number of Members holding it.

#### Scenario: A Title two Members hold
- **WHEN** a librarian reads the list
- **THEN** the Title shows 2 holding
`,
      { byPath: true },
    );
    const claims = part(stdout, 'Claims in requirements it does not touch');
    const at = claims.indexOf('holds › Hold counts stay private');
    assert.ok(at > 0, stdout);
    assert.match(claims.slice(at).join('\n'), /No request SHALL reveal the number of Members holding/);
  });

  it('shows a change to what a Member stores the specs that store a field on a Member', (t) => {
    const stdout = claimsOn(
      t,
      'member-stores-fields',
      'members',
      `## MODIFIED Requirements

### Requirement: A Member record has fixed fields

A Member SHALL store its name and its join date, and nothing else.

#### Scenario: Nothing else is stored
- **WHEN** a librarian opens a Member record
- **THEN** it shows the name and the join date
`,
    );
    const own = part(stdout, 'Its own claims').join('\n');
    const specs = /"store" beside its terms, in requirements of: (.+)/.exec(own)?.[1] ?? '';
    for (const capability of ['reading-history', 'branch-pages', 'member-settings'])
      assert.ok(specs.includes(capability), `${capability} is missing from: ${specs}`);
  });

  it('shows a change to one requirement the claims of the other requirements of its spec', (t) => {
    const stdout = claimsOn(
      t,
      'holds-counted-on-the-page',
      'holds',
      `## MODIFIED Requirements

### Requirement: A Member sees their own holds

A Title's page SHALL show the number of Members holding it.

#### Scenario: Two Members hold
- **WHEN** two Members are holding a Title
- **THEN** its page says 2 holding
`,
    );
    const claims = part(stdout, 'Claims in requirements it does not touch');
    assert.ok(claims.includes('holds › Hold counts stay private'), stdout);
    assert.ok(!claims.includes('holds › A Member sees their own holds'));
  });

  it('names a change it cannot find', (t) => {
    t.mock.method(console, 'log', () => {});
    const errors = t.mock.method(console, 'error', () => {});
    assert.equal(main(['claims', 'no-such-change', '--root', repo.root]), 1);
    assert.match(errors.mock.calls[0].arguments[0], /no change named no-such-change/);
  });
});

describe('claims without a glossary', () => {
  it('throws where the config names no glossary, or the file is absent', () => {
    repo.checks({});
    assert.throws(() => run(repo.context([])), /claims needs a glossary: name its file in "glossary"/);
    repo.checks({ glossary: 'NONE.md' });
    assert.throws(() => run(repo.context([])), /no glossary NONE\.md/);
  });

  it('throws where the glossary defines no terms', () => {
    repo.write({ 'GLOSSARY.md': '# Library\n\nA Title is a book.\n' });
    assert.throws(() => run(repo.context([])), /GLOSSARY\.md defines no terms/);
  });
});
