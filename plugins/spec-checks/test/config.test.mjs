import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ALL_CHECKS, configProblems, findRoot, loadConfig, parseConfig } from '../lib/config.mjs';
import { tempFolder, writeChecks } from './temp-repo.mjs';

const problemsOf = (own) => configProblems(parseConfig(JSON.stringify(own)));

describe('parseConfig', () => {
  it('fills in every default for an empty config', () => {
    assert.deepEqual(parseConfig('{}'), {
      baseRefs: ['origin/main'],
      checks: ALL_CHECKS,
      baselines: {
        validate: 'openspec/long-requirements-not-yet.txt',
        coverage: 'e2e/coverage/not-yet.txt',
        shall: 'openspec/shall-not-yet.txt',
        repeated: 'openspec/repeated-lists-not-yet.txt',
      },
      coverage: { mapDir: 'e2e/coverage', adapters: [] },
      glossary: null,
      sweep: { groups: {}, dismissed: 'openspec/disagreements-dismissed.txt' },
      extra: [],
    });
    assert.deepEqual(ALL_CHECKS, ['validate', 'coverage', 'shall', 'dropped', 'repeated', 'gate']);
  });

  it('reads a nested field over its defaults, one level deep', () => {
    const config = parseConfig('{ "baselines": { "shall": "specs/gaps.txt" }, "coverage": { "mapDir": "map" } }');
    assert.equal(config.baselines.shall, 'specs/gaps.txt');
    assert.equal(config.baselines.validate, 'openspec/long-requirements-not-yet.txt');
    assert.deepEqual(config.coverage, { mapDir: 'map', adapters: [] });
  });
});

describe('configProblems', () => {
  it('finds none in the defaults', () => {
    assert.deepEqual(problemsOf({}), []);
  });

  it('names a coverage map folder or a baseline that is no path', () => {
    assert.deepEqual(problemsOf({ coverage: { mapDir: 3 } }), ['"coverage.mapDir" is a folder, as "e2e/coverage"']);
    assert.deepEqual(problemsOf({ baselines: { coverage: null, shall: ' ' } }), [
      '"baselines.coverage" is the path of a file',
      '"baselines.shall" is the path of a file',
    ]);
  });

  it('names baseRefs that are empty or no list', () => {
    const message = '"baseRefs" is a list of one or more refs, as ["origin/main"]';
    assert.deepEqual(problemsOf({ baseRefs: [] }), [message]);
    assert.deepEqual(problemsOf({ baseRefs: 'origin/main' }), [message]);
  });

  it('names checks that are no list, and a check it does not know', () => {
    assert.deepEqual(problemsOf({ checks: 'shall' }), ['"checks" is a list of check names']);
    assert.deepEqual(problemsOf({ checks: ['shall', 'lint'] }), [
      '"checks" names lint, which is none of validate, coverage, shall, dropped, repeated, gate',
    ]);
  });

  it('names an adapter of an unknown kind, and one with no roots', () => {
    assert.deepEqual(problemsOf({ coverage: { adapters: [{ kind: 'jest', roots: ['src'] }] } }), [
      'a coverage adapter\'s "kind" is one of playwright, vitest, node-test, not jest',
    ]);
    assert.deepEqual(problemsOf({ coverage: { adapters: [{ kind: 'vitest', roots: [] }] } }), [
      'the vitest adapter needs "roots", a list of folders',
    ]);
  });

  it('takes "e2e" on a Vitest or node:test adapter, and names a wrong one', () => {
    assert.deepEqual(problemsOf({ coverage: { adapters: [{ kind: 'node-test', roots: ['cli/e2e'], e2e: true }] } }), []);
    assert.deepEqual(problemsOf({ coverage: { adapters: [{ kind: 'vitest', roots: ['src'], e2e: 'yes' }] } }), [
      'the vitest adapter\'s "e2e" is true or false',
    ]);
    assert.deepEqual(problemsOf({ coverage: { adapters: [{ kind: 'playwright', roots: ['e2e/tests'], e2e: true }] } }), [
      'the playwright adapter holds end-to-end tests already, so it takes no "e2e"',
    ]);
  });

  it('names a root that an "e2e" adapter shares with another adapter, and takes a root inside another', () => {
    const adapters = (unitRoots) => ({
      coverage: {
        adapters: [
          { kind: 'vitest', roots: unitRoots },
          { kind: 'node-test', roots: ['packages/cli/e2e'], e2e: true },
        ],
      },
    });
    assert.deepEqual(problemsOf(adapters(['packages'])), []);
    assert.deepEqual(problemsOf(adapters(['./packages/cli/e2e/'])), [
      'packages/cli/e2e is a root of an "e2e" adapter and of the vitest adapter. Give each root one kind of test',
    ]);
  });

  it('names adapters that are no list, and does not throw', () => {
    assert.ok(problemsOf({ coverage: { adapters: { kind: 'vitest' } } }).length > 0);
    assert.ok(problemsOf({ coverage: { adapters: [null] } }).length > 0);
  });

  it('names a sweep group that is no list', () => {
    assert.deepEqual(problemsOf({ sweep: { groups: { lending: 'loans' } } }), [
      'sweep group lending is a list of capabilities',
    ]);
  });

  it('names an extra entry with no command', () => {
    const message = 'an "extra" entry is a command, or { "name", "command", "preview" }';
    assert.deepEqual(problemsOf({ extra: [' '] }), [message]);
    assert.deepEqual(problemsOf({ extra: [{ name: 'types' }] }), [message]);
    assert.deepEqual(problemsOf({ extra: ['npm test', { name: 'types', command: 'tsc' }] }), []);
  });
});

describe('findRoot and loadConfig', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds the folder at or above a start that holds openspec/checks.json', () => {
    writeChecks(root);
    mkdirSync(join(root, 'src', 'loans'), { recursive: true });
    assert.equal(findRoot(join(root, 'src', 'loans')), root);
    assert.equal(findRoot(root), root);
  });

  it('is null where no folder above the start holds one', () => {
    assert.equal(findRoot(root), null);
  });

  it('throws where the config is absent, no JSON, or has a problem', () => {
    assert.throws(() => loadConfig(root), /no openspec\/checks\.json in .*\. Copy the plugin's templates\/openspec\/checks\.json/);
    writeChecks(root);
    writeFileSync(join(root, 'openspec/checks.json'), '{ not json');
    assert.throws(() => loadConfig(root), /^Error: openspec\/checks\.json: /);
    writeChecks(root, { checks: ['lint'], baseRefs: [] });
    assert.throws(
      () => loadConfig(root),
      (error) =>
        error.message ===
        'openspec/checks.json:\n  "baseRefs" is a list of one or more refs, as ["origin/main"]\n  "checks" names lint, which is none of validate, coverage, shall, dropped, repeated, gate',
    );
  });
});
