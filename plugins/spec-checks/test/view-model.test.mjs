import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { coverageOf, findSpecsRoot, readSteps, readView, specView } from '../lib/view/model.mjs';
import { tempFolder, writeChecks } from './temp-repo.mjs';

const SPEC = `# Sign-in Specification

## Purpose

How a member signs in
with a link.

## Requirements

### Requirement: Sign-in link

The system SHALL mail a link. The link SHALL work once.

#### Scenario: Known address
- **WHEN** a member asks for a link
  with a known address
- **THEN** the system mails a link
- **AND** the link works once

#### Scenario: Unknown address
- **WHEN**: a stranger asks
- the system mails nothing

### Requirement: Rate limit

Prose with no rule.
`;

describe('readSteps', () => {
  it('reads each keyword step and joins a wrapped line to the step above it', () => {
    assert.deepEqual(readSteps(['- **WHEN** a member asks', '  with a known address', '- **THEN** a link']), [
      { keyword: 'WHEN', text: 'a member asks with a known address' },
      { keyword: 'THEN', text: 'a link' },
    ]);
  });

  it('reads a numbered step, and a colon inside the bold', () => {
    assert.deepEqual(readSteps(['1. **WHEN:** a member asks', '2) **THEN** a link']), [
      { keyword: 'WHEN', text: 'a member asks' },
      { keyword: 'THEN', text: 'a link' },
    ]);
  });

  it('keeps a list item with no keyword as a step with a null keyword, and skips blank lines', () => {
    assert.deepEqual(readSteps(['', '- **GIVEN**: a member', '- plain item', '']), [
      { keyword: 'GIVEN', text: 'a member' },
      { keyword: null, text: 'plain item' },
    ]);
  });
});

describe('coverageOf', () => {
  it('splits an e2e or unit reference into its file and title', () => {
    assert.deepEqual(coverageOf({ e2e: 'e2e/tests/sign-in.spec.ts › mails a link' }, false), {
      kind: 'e2e',
      file: 'e2e/tests/sign-in.spec.ts',
      title: 'mails a link',
    });
    assert.deepEqual(coverageOf({ unit: 'src/link.test.ts › works once', checked: 'still holds' }, false), {
      kind: 'unit',
      file: 'src/link.test.ts',
      title: 'works once',
      checked: 'still holds',
    });
  });

  it('gives the reason of a none entry', () => {
    assert.deepEqual(coverageOf({ none: 'a manual check' }, false), { kind: 'none', reason: 'a manual check' });
  });

  it('marks a scenario that is mapped and still on the not-yet list as a conflict, with its entry', () => {
    assert.deepEqual(coverageOf({ none: 'manual' }, true), { kind: 'conflict', mapped: { kind: 'none', reason: 'manual' } });
  });

  it('tells a scenario on the not-yet list from one that is nowhere', () => {
    assert.deepEqual(coverageOf(undefined, true), { kind: 'not-yet' });
    assert.deepEqual(coverageOf(undefined, false), { kind: 'missing' });
  });

  it('marks an entry with no accepted kind as invalid', () => {
    assert.deepEqual(coverageOf({ e2e: 'a', unit: 'b' }, false), { kind: 'invalid' });
    assert.deepEqual(coverageOf({ manual: 'x' }, false), { kind: 'invalid' });
  });
});

describe('specView', () => {
  it('reads the title, the purpose, and each requirement with its SHALL count and scenarios', () => {
    const view = specView('sign-in', SPEC);
    assert.equal(view.title, 'Sign-in Specification');
    assert.deepEqual(view.purpose, ['How a member signs in', 'with a link.']);
    const [link, limit] = view.requirements;
    assert.equal(link.key, 'sign-in › Sign-in link');
    assert.deepEqual(link.body, ['The system SHALL mail a link. The link SHALL work once.']);
    assert.equal(link.shall, 2);
    assert.deepEqual(
      link.scenarios.map((scenario) => [scenario.name, scenario.steps.length, scenario.coverage]),
      [
        ['Known address', 3, null],
        ['Unknown address', 2, null],
      ],
    );
    assert.equal(limit.shall, 0);
    assert.deepEqual(limit.scenarios, []);
  });

  it('takes each scenario coverage from the map, then the not-yet list', () => {
    const map = { 'Sign-in link': { 'Known address': { none: 'manual' } } };
    const view = specView('sign-in', SPEC, map, new Set(['sign-in › Sign-in link › Unknown address']));
    assert.deepEqual(
      view.requirements[0].scenarios.map((scenario) => scenario.coverage.kind),
      ['none', 'not-yet'],
    );
  });

  it('counts only the map\'s own keys, so a name every object has finds no entry', () => {
    const spec = '### Requirement: constructor\nThe system SHALL work.\n\n#### Scenario: name\n- **THEN** it works\n\n#### Scenario: toString\n- **THEN** it works\n';
    const view = specView('odd', spec, {}, new Set(['odd › constructor › name']));
    assert.deepEqual(
      view.requirements[0].scenarios.map((scenario) => scenario.coverage.kind),
      ['not-yet', 'missing'],
    );
  });

  it('uses the capability as the title when the spec has no level-one heading', () => {
    assert.equal(specView('loans', '## Requirements\n').title, 'loans');
  });
});

function project({ checks }) {
  const root = tempFolder();
  mkdirSync(join(root, 'openspec/specs/sign-in'), { recursive: true });
  writeFileSync(join(root, 'openspec/specs/sign-in/spec.md'), SPEC);
  if (checks) writeChecks(root);
  return root;
}

describe('readView', () => {
  it('reads coverage from the map and the not-yet list where the project has openspec/checks.json', () => {
    const root = project({ checks: true });
    try {
      mkdirSync(join(root, 'e2e/coverage'), { recursive: true });
      writeFileSync(
        join(root, 'e2e/coverage/sign-in.json'),
        JSON.stringify({ 'Sign-in link': { 'Known address': { e2e: 'e2e/tests/a.spec.ts › mails' } } }),
      );
      writeFileSync(join(root, 'e2e/coverage/not-yet.txt'), 'sign-in › Sign-in link › Unknown address\n');
      const view = readView(root);
      assert.equal(view.coverageTracked, true);
      assert.deepEqual(view.summary, { specs: 1, requirements: 2, scenarios: 2, coverage: { e2e: 1, 'not-yet': 1 } });
      assert.deepEqual(view.errors, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('shows the specs with no coverage where the project has no openspec/checks.json', () => {
    const root = project({ checks: false });
    try {
      const view = readView(root);
      assert.equal(view.coverageTracked, false);
      assert.equal(view.specs[0].requirements[0].scenarios[0].coverage, null);
      assert.deepEqual(view.summary.coverage, {});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('names a map file that does not parse, and still shows its spec', () => {
    const root = project({ checks: true });
    try {
      mkdirSync(join(root, 'e2e/coverage'), { recursive: true });
      writeFileSync(join(root, 'e2e/coverage/sign-in.json'), '{ not json');
      const view = readView(root);
      assert.equal(view.errors.length, 1);
      assert.match(view.errors[0], /^e2e\/coverage\/sign-in\.json: /);
      assert.deepEqual(view.summary.coverage, { missing: 2 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('readView with a broken file', () => {
  for (const [name, text] of [
    ['null', 'null'],
    ['a list', '[]'],
  ]) {
    it(`names a map file that holds ${name}, and shows its scenarios as missing`, () => {
      const root = project({ checks: true });
      try {
        mkdirSync(join(root, 'e2e/coverage'), { recursive: true });
        writeFileSync(join(root, 'e2e/coverage/sign-in.json'), text);
        const view = readView(root);
        assert.deepEqual(view.errors, ['e2e/coverage/sign-in.json: holds no object of requirement → scenario → entry']);
        assert.deepEqual(view.summary.coverage, { missing: 2 });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('shows the specs with no coverage, and names the config, where openspec/checks.json does not parse', () => {
    const root = project({ checks: false });
    try {
      writeFileSync(join(root, 'openspec/checks.json'), '{ not json');
      const view = readView(root);
      assert.equal(view.coverageTracked, false);
      assert.equal(view.configFound, true);
      assert.equal(view.specs.length, 1);
      assert.equal(view.errors.length, 1);
      assert.match(view.errors[0], /^openspec\/checks\.json: /);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('findSpecsRoot', () => {
  it('finds the folder with openspec/specs at or above the start, or null', () => {
    const root = project({ checks: false });
    try {
      assert.equal(findSpecsRoot(join(root, 'openspec/specs/sign-in')), root);
      assert.equal(findSpecsRoot(tempFolder()), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
