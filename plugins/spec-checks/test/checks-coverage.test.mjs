/**
 * The coverage check end to end, in a temp project: the map, the not-yet list,
 * Playwright files under an adapter root, and unit tests under a unit root.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { run } from '../lib/checks/coverage.mjs';
import { loadTypeScript } from '../lib/typescript.mjs';
import { mainSpec, tempRepo, withEnv } from './temp-repo.mjs';

const LASTS = 'loans › A loan lasts three weeks › A loan lasts three weeks holds';
const RENEWED = 'loans › A loan is renewed once › A loan is renewed once holds';

const SPEC = mainSpec('loans', {
  'A loan lasts three weeks': 'A loan SHALL last three weeks.',
  'A loan is renewed once': 'A member SHALL renew a loan once.',
});

const E2E = `import { test } from '@playwright/test';
import { covers } from '../support/covers';

test('renews a loan', { annotation: covers('${RENEWED}') }, async ({ page }) => {});
test('shows the catalogue', async ({ page }) => {});
`;

const UNIT = `import { it } from 'vitest';
it('lasts three weeks', () => {});
`;

/** The map of the loans spec, with one entry per scenario. A null entry leaves its scenario out. */
const map = (lasts = { unit: 'src/loans.test.ts › lasts three weeks' }) =>
  `${JSON.stringify({
    'A loan lasts three weeks': lasts ? { 'A loan lasts three weeks holds': lasts } : {},
    'A loan is renewed once': { 'A loan is renewed once holds': { e2e: 'e2e/tests/loans/renew.spec.ts › renews a loan' } },
  })}\n`;

let repo;
beforeEach(() => {
  repo = tempRepo();
  repo.checks({
    coverage: {
      mapDir: 'e2e/coverage',
      adapters: [
        { kind: 'playwright', roots: ['e2e/tests'] },
        { kind: 'vitest', roots: ['src'] },
      ],
    },
  });
  repo.write({
    'openspec/specs/loans/spec.md': SPEC,
    'e2e/tests/loans/renew.spec.ts': E2E,
    'src/loans.test.ts': UNIT,
    'e2e/coverage/loans.json': map(),
    'e2e/coverage/not-yet.txt': '# Scenarios with no entry yet.\n',
  });
  repo.commit('Start');
  repo.setBase();
});
afterEach(() => repo.remove());

const check = (args = []) => run(repo.context(args));

describe('the coverage check', () => {
  it('passes a map whose entries name a Playwright test under an adapter root and a unit test', () => {
    assert.deepEqual(check(), { problems: [], summary: '2 of 2 scenarios mapped, 0 not yet' });
  });

  it('reads the covers() annotation, and fails a test that does not name its scenario', () => {
    repo.write({ 'e2e/tests/loans/renew.spec.ts': E2E.replace(`{ annotation: covers('${RENEWED}') }, `, '') });
    assert.deepEqual(check().problems, [
      `${RENEWED}: e2e/tests/loans/renew.spec.ts › renews a loan does not name it in covers(…)`,
    ]);
  });

  it('reads no Playwright file outside the adapter roots', () => {
    repo.write({
      'e2e/tests/loans/renew.spec.ts': null,
      'e2e/other/renew.spec.ts': E2E,
    });
    assert.deepEqual(check().problems, [`${RENEWED}: no test e2e/tests/loans/renew.spec.ts › renews a loan`]);
  });

  it('fails a unit entry outside every unit root', () => {
    repo.write({
      'scripts/loans.test.ts': UNIT,
      'e2e/coverage/loans.json': map({ unit: 'scripts/loans.test.ts › lasts three weeks' }),
    });
    assert.deepEqual(check().problems, [
      `${LASTS}: scripts/loans.test.ts is under no unit test root in openspec/checks.json: src`,
    ]);
  });

  it('passes an e2e entry that names a Vitest test under an adapter marked e2e', () => {
    repo.checks({
      coverage: {
        mapDir: 'e2e/coverage',
        adapters: [
          { kind: 'vitest', roots: ['src'] },
          { kind: 'vitest', roots: ['cli/e2e'], e2e: true },
        ],
      },
    });
    repo.write({
      'cli/e2e/renew.test.ts': "it('renews a loan from the command line', () => {});\n",
      'e2e/coverage/loans.json': `${JSON.stringify({
        'A loan lasts three weeks': { 'A loan lasts three weeks holds': { unit: 'src/loans.test.ts › lasts three weeks' } },
        'A loan is renewed once': {
          'A loan is renewed once holds': { e2e: 'cli/e2e/renew.test.ts › renews a loan from the command line' },
        },
      })}\n`,
    });
    assert.deepEqual(check(), { problems: [], summary: '2 of 2 scenarios mapped, 0 not yet' });
  });

  it('takes a unit entry anywhere outside the end-to-end roots when no adapter holds unit tests', () => {
    repo.checks({
      coverage: {
        mapDir: 'e2e/coverage',
        adapters: [
          { kind: 'playwright', roots: ['e2e/tests'] },
          { kind: 'node-test', roots: ['cli/e2e'], e2e: true },
        ],
      },
    });
    assert.deepEqual(check(), { problems: [], summary: '2 of 2 scenarios mapped, 0 not yet' });
  });

  it('fails a not-yet line the base did not have', () => {
    repo.write({
      'e2e/coverage/loans.json': map(null),
      'e2e/coverage/not-yet.txt': `${LASTS}\n`,
    });
    assert.deepEqual(check().problems, [
      `e2e/coverage/not-yet.txt: ${LASTS} was not on the list at the base. The list only shrinks: cover it, or map it`,
    ]);
  });

  it('fails a scenario whose text changed since the base while its test did not', () => {
    repo.write({ 'openspec/specs/loans/spec.md': SPEC.replace('- **THEN** a loan is renewed once', '- **THEN** the loan is due later') });
    assert.deepEqual(check().problems, [
      `${RENEWED}: its text changed since the base, and e2e/tests/loans/renew.spec.ts did not. Update the test, or say in "checked" why it already shows the new text`,
    ]);
    repo.write({ 'e2e/tests/loans/renew.spec.ts': `${E2E}// Checks the new due date.\n` });
    assert.deepEqual(check().problems, []);
  });

  it('writes the not-yet list as the scenarios with no entry', () => {
    repo.write({ 'e2e/coverage/loans.json': map(null) });
    const ctx = repo.context(['--write']);
    // The base had no such line, so the list it wrote grew.
    assert.deepEqual(run(ctx).problems, [
      `e2e/coverage/not-yet.txt: ${LASTS} was not on the list at the base. The list only shrinks: cover it, or map it`,
    ]);
    assert.equal(
      readFileSync(join(repo.root, 'e2e/coverage/not-yet.txt'), 'utf8'),
      `# Scenarios with no entry yet.\n${LASTS}\n`,
    );
    assert.deepEqual(ctx.notes, ['wrote 1 lines to e2e/coverage/not-yet.txt']);
  });

  it('writes the not-yet list where its folder does not exist yet', () => {
    repo.write({ 'e2e/coverage': null });
    const ctx = repo.context(['--write']);
    withEnv({ CI: undefined }, () => run(ctx));
    assert.equal(
      readFileSync(join(repo.root, 'e2e/coverage/not-yet.txt'), 'utf8'),
      `${LASTS}\n${RENEWED}\n`,
    );
  });
});

describe('loading TypeScript', () => {
  /** A typescript package in the project that hands on the plugin's copy and marks that it ran. */
  const projectTypeScript = (mark) => {
    const plugin = createRequire(import.meta.url).resolve('typescript');
    repo.write({
      'node_modules/typescript/package.json': '{ "name": "typescript", "main": "index.js" }\n',
      'node_modules/typescript/index.js': `globalThis[${JSON.stringify(mark)}] = true;\nmodule.exports = require(${JSON.stringify(plugin)});\n`,
    });
  };

  it("takes the project's own typescript where the project has one", () => {
    projectTypeScript('projectTypeScriptLoaded');
    assert.deepEqual(check().problems, []);
    assert.equal(globalThis.projectTypeScriptLoaded, true);
  });

  it('loads typescript for a map whose only test entries are e2e entries under a test runner', () => {
    projectTypeScript('e2eRunnerTypeScriptLoaded');
    repo.checks({
      coverage: { mapDir: 'e2e/coverage', adapters: [{ kind: 'node-test', roots: ['cli/e2e'], e2e: true }] },
    });
    repo.write({
      'cli/e2e/renew.test.ts': "it('renews a loan from the command line', () => {});\n",
      'e2e/coverage/loans.json': `${JSON.stringify({
        'A loan lasts three weeks': { 'A loan lasts three weeks holds': { none: 'the clock is the library system' } },
        'A loan is renewed once': {
          'A loan is renewed once holds': { e2e: 'cli/e2e/renew.test.ts › renews a loan from the command line' },
        },
      })}\n`,
    });
    assert.deepEqual(check().problems, []);
    assert.equal(globalThis.e2eRunnerTypeScriptLoaded, true);
  });

  it("falls back to the plugin's typescript where the project has none", () => {
    assert.equal(loadTypeScript(repo.root), createRequire(import.meta.url)('typescript'));
  });

  // TypeScript 7 compiles natively and ships no compiler API. A project on it keeps the API
  // through @typescript/typescript6, the side-by-side package TypeScript publishes for tools.
  const typeScriptSeven = () =>
    repo.write({
      'node_modules/typescript/package.json': '{ "name": "typescript", "version": "7.0.2", "main": "version.cjs" }\n',
      'node_modules/typescript/version.cjs': 'exports.version = "7.0.2";\n',
    });

  it("takes @typescript/typescript6 where the project's typescript is 7 and has no compiler API", () => {
    typeScriptSeven();
    const plugin = createRequire(import.meta.url).resolve('typescript');
    repo.write({
      'node_modules/@typescript/typescript6/package.json': '{ "name": "@typescript/typescript6", "main": "index.js" }\n',
      'node_modules/@typescript/typescript6/index.js': `globalThis.typeScriptSixLoaded = true;\nmodule.exports = require(${JSON.stringify(plugin)});\n`,
    });
    assert.deepEqual(check().problems, []);
    assert.equal(globalThis.typeScriptSixLoaded, true);
  });

  it("falls back to the plugin's typescript where the project's typescript has no compiler API", () => {
    typeScriptSeven();
    assert.equal(loadTypeScript(repo.root), createRequire(import.meta.url)('typescript'));
  });

  it('names @typescript/typescript6 when the only typescript it finds has no compiler API', () => {
    typeScriptSeven();
    assert.throws(() => loadTypeScript(repo.root, [repo.root]), /typescript 7\.0\.2 has none.*@typescript\/typescript6/);
  });
});
