import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { main, runCheck } from '../lib/cli.mjs';
import { tempFolder, tempRepo, withEnv, writeChecks } from './temp-repo.mjs';

/** Silence the console for one test, and return what it printed. */
function quiet(t) {
  const log = t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  const text = (mock) => mock.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
  return { out: () => text(log), err: () => text(error) };
}

describe('main', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('prints the usage and returns 0 for --help', (t) => {
    const printed = quiet(t);
    assert.equal(main(['--help']), 0);
    assert.match(printed.out(), /^usage: spec-checks <command>/);
  });

  it('prints the usage and returns 2 with no command', (t) => {
    quiet(t);
    assert.equal(main([]), 2);
  });

  it('returns 2 for an unknown command', (t) => {
    const printed = quiet(t);
    assert.equal(main(['lint', '--root', root]), 2);
    assert.match(printed.err(), /^spec-checks: no command lint/);
  });

  it('returns 2 where no checks.json is at or above the root', (t) => {
    const printed = quiet(t);
    assert.equal(main(['shall', '--root', root]), 2);
    assert.match(printed.err(), /no openspec\/checks\.json at or above .*\. Copy the plugin's templates\/openspec\/checks\.json there/);
  });

  it('returns 2 for a config with a problem', (t) => {
    const printed = quiet(t);
    writeChecks(root, { checks: ['lint'] });
    assert.equal(main(['shall', '--root', root]), 2);
    assert.match(printed.err(), /"checks" names lint/);
  });
});

describe('main view', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
    mkdirSync(join(root, 'openspec/specs'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  for (const port of ['', ' ', '0x10', '1e3', '-5', '70000']) {
    it(`refuses --port ${JSON.stringify(port)} before it starts a server`, (t) => {
      const printed = quiet(t);
      assert.equal(main(['view', '--root', root, '--port', port]), 2);
      assert.match(printed.err(), /--port takes a number from 0 to 65535/);
    });
  }

  it('refuses an option it does not know, such as --port=5000', (t) => {
    const printed = quiet(t);
    assert.equal(main(['view', '--root', root, '--port=5000']), 2);
    assert.match(printed.err(), /--port=5000 is not an option of view/);
  });

  it('refuses a folder with no openspec/specs at or above it', (t) => {
    const printed = quiet(t);
    const empty = tempFolder();
    try {
      assert.equal(main(['view', '--root', empty]), 2);
      assert.match(printed.err(), /no openspec\/specs at or above/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('main on a project', () => {
  let repo;
  beforeEach(() => {
    repo = tempRepo();
    repo.write({
      'openspec/specs/loans/spec.md':
        '# loans\n\n## Requirements\n\n### Requirement: A loan lasts three weeks\n\nA loan SHALL last three weeks. It SHALL end at closing time.\n\n#### Scenario: A loan ends\n- **THEN** it ends\n',
    });
  });
  afterEach(() => repo.remove());

  it('returns 1 for a check with problems, and 0 for one without', (t) => {
    const printed = quiet(t);
    repo.checks();
    repo.commit('Start');
    repo.setBase();
    assert.equal(main(['shall', '--root', repo.root]), 1);
    assert.match(printed.err(), /^shall: 1 problems:/);
    assert.equal(main(['dropped', '--root', repo.root]), 0);
    assert.match(printed.out(), /dropped: no requirement left a main spec without a delta/);
  });

  it('verify runs each check in checks.json, then each extra command, and counts the failures', (t) => {
    const printed = quiet(t);
    repo.checks({ checks: ['dropped'], extra: ['true', { name: 'types', command: 'false' }] });
    repo.commit('Start');
    repo.setBase();
    assert.equal(main(['verify', '--root', repo.root]), 1);
    assert.match(printed.err(), /types: failed with exit 1/);
    assert.match(printed.out(), /verify: 1 of 3 checks fail/);
  });

  it('runCheck returns the error a check throws as its result', () => {
    repo.checks({ baseRefs: ['origin/none'] });
    const ctx = { ...repo.context(), base: undefined };
    const result = withEnv({ CI: 'true' }, () => runCheck('dropped', ctx));
    assert.deepEqual(result.problems, []);
    assert.match(result.error, /none of origin\/none exists/);
  });
});
