import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startViewer } from '../lib/view/server.mjs';
import { tempFolder, writeChecks } from './temp-repo.mjs';

const SPEC = `# Sign-in Specification

## Purpose

How a member signs in.

## Requirements

### Requirement: Sign-in link

The system SHALL mail a link.

#### Scenario: Known address
- **WHEN** a member asks for a link
- **THEN** the system mails a link
`;

/** One request, with the Host header the test names. */
function get(port, path, { host = `127.0.0.1:${port}`, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Connect to /events, run `act` once the stream is open, and resolve to the
 * stream's text when a change event arrives.
 */
function changeAfter(port, act) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/events' }, (response) => {
      response.setEncoding('utf8');
      let stream = '';
      let acted = false;
      response.on('data', (chunk) => {
        stream += chunk;
        if (stream.includes('event: change')) {
          req.destroy();
          resolve(stream);
        } else if (!acted && stream.includes('retry:')) {
          acted = true;
          act();
        }
      });
    });
    req.on('error', (error) => (error.code === 'ECONNRESET' ? undefined : reject(error)));
    req.end();
    setTimeout(() => {
      req.destroy();
      reject(new Error('no change event within 6 seconds'));
    }, 6000).unref();
  });
}

describe('startViewer', () => {
  let root;
  let viewer;

  before(async () => {
    root = tempFolder();
    mkdirSync(join(root, 'openspec/specs/sign-in'), { recursive: true });
    writeFileSync(join(root, 'openspec/specs/sign-in/spec.md'), SPEC);
    writeChecks(root);
    viewer = await startViewer({ root, port: 0 });
  });

  after(async () => {
    await viewer.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it('listens on 127.0.0.1 only', () => {
    assert.match(viewer.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it('serves the index, each spec, the model, the stylesheet and the script', async () => {
    const pages = {
      '/': ['text/html', /href="\/spec\/sign-in"/],
      '/spec/sign-in': ['text/html', /Known address/],
      '/view.json': ['application/json', /"capability": "sign-in"/],
      '/style.css': ['text/css', /--paper/],
      '/live.js': ['text/javascript', /EventSource/],
    };
    for (const [path, [type, body]] of Object.entries(pages)) {
      const response = await get(viewer.port, path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['content-type'], `${type}; charset=utf-8`, path);
      assert.match(response.body, body, path);
      assert.match(response.headers['content-security-policy'], /default-src 'none'/, path);
    }
  });

  it('answers 404 for a spec that does not exist, and for a path outside the pages', async () => {
    assert.equal((await get(viewer.port, '/spec/nope')).status, 404);
    assert.equal((await get(viewer.port, '/spec/..%2F..%2Fetc')).status, 404);
    assert.equal((await get(viewer.port, '/../package.json')).status, 404);
    assert.equal((await get(viewer.port, '/spec/%E0%A4%A')).status, 400);
  });

  it('refuses a request whose Host names another site', async () => {
    const response = await get(viewer.port, '/', { host: `evil.example:${viewer.port}` });
    assert.equal(response.status, 403);
    assert.equal((await get(viewer.port, '/', { host: `localhost:${viewer.port}` })).status, 200);
  });

  it('refuses a request that would change something', async () => {
    assert.equal((await get(viewer.port, '/', { method: 'POST' })).status, 405);
  });

  it('shows a change to a spec on the next request, and tells open pages to reload', async () => {
    const stream = await changeAfter(viewer.port, () =>
      writeFileSync(join(root, 'openspec/specs/sign-in/spec.md'), SPEC.replace('Known address', 'Known mail address')),
    );
    assert.match(stream, /event: change\ndata: reload\n\n/);
    assert.match((await get(viewer.port, '/spec/sign-in')).body, /Known mail address/);
  });

  it('tells open pages to reload when the coverage map folder appears after the start', async () => {
    await changeAfter(viewer.port, () => {
      mkdirSync(join(root, 'e2e/coverage'), { recursive: true });
      writeFileSync(join(root, 'e2e/coverage/sign-in.json'), '{}');
    });
    await changeAfter(viewer.port, () => writeFileSync(join(root, 'e2e/coverage/sign-in.json'), '{ }'));
  });

  it('watches the coverage map folder again after it is deleted and made again', async () => {
    const map = join(root, 'e2e/coverage');
    mkdirSync(map, { recursive: true });
    writeFileSync(join(map, 'sign-in.json'), '{}');
    await changeAfter(viewer.port, () => rmSync(map, { recursive: true, force: true }));
    await changeAfter(viewer.port, () => {
      mkdirSync(map, { recursive: true });
      writeFileSync(join(map, 'sign-in.json'), '{}');
    });
    // Let the look that follows the re-made folder pass, so only the edit below can send the event.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await changeAfter(viewer.port, () => writeFileSync(join(map, 'sign-in.json'), '{ }'));
  });

  it('answers HEAD on /events with the headers, and ends the response', async () => {
    const response = await get(viewer.port, '/events', { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'text/event-stream; charset=utf-8');
  });
});

describe('startViewer on a project with its not-yet list in a folder of its own', () => {
  it('tells open pages to reload when the list changes', async () => {
    const root = tempFolder();
    mkdirSync(join(root, 'openspec/specs/sign-in'), { recursive: true });
    writeFileSync(join(root, 'openspec/specs/sign-in/spec.md'), SPEC);
    writeChecks(root, { baselines: { coverage: 'lists/not-yet.txt' } });
    mkdirSync(join(root, 'lists'));
    writeFileSync(join(root, 'lists/not-yet.txt'), 'sign-in › Sign-in link › Known address\n');
    const viewer = await startViewer({ root, port: 0 });
    try {
      await changeAfter(viewer.port, () => writeFileSync(join(root, 'lists/not-yet.txt'), ''));
    } finally {
      await viewer.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('startViewer when the specs do not load', () => {
  it('answers 500 with a page that keeps the live script', async () => {
    const root = tempFolder();
    // A spec.md that is a folder makes the read fail.
    mkdirSync(join(root, 'openspec/specs/broken/spec.md'), { recursive: true });
    const viewer = await startViewer({ root, port: 0, watchFiles: false });
    try {
      const response = await get(viewer.port, '/');
      assert.equal(response.status, 500);
      assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
      assert.match(response.body, /The specs do not load/);
      assert.match(response.body, /<script src="\/live\.js" defer>/);
    } finally {
      await viewer.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('startViewer on a taken port', () => {
  it('takes a free port when the caller allows it, and fails when it does not', async () => {
    const root = tempFolder();
    mkdirSync(join(root, 'openspec/specs'), { recursive: true });
    const first = await startViewer({ root, port: 0, watchFiles: false });
    try {
      const second = await startViewer({ root, port: first.port, watchFiles: false });
      assert.notEqual(second.port, first.port);
      await second.stop();
      await assert.rejects(startViewer({ root, port: first.port, fallback: false, watchFiles: false }), { code: 'EADDRINUSE' });
    } finally {
      await first.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
