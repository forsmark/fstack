/**
 * `spec-checks view`: a local, read-only web server for the specs. It reads the
 * files again for each page, so a page always shows the files as they are, and
 * it tells open pages to reload when a spec or a coverage map changes.
 */
import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { loadConfig } from '../config.mjs';
import { readView } from './model.mjs';
import { renderError, renderIndex, renderNotFound, renderSpec } from './render.mjs';

const ASSETS = new URL('./assets/', import.meta.url);
const asset = (name) => readFileSync(new URL(name, ASSETS), 'utf8');

/** The port the viewer tries first, so a bookmark keeps working. */
export const DEFAULT_PORT = 4747;

// The pages load nothing from outside this server, and run no inline script.
const SECURITY = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(response, status, type, body) {
  response.writeHead(status, { ...SECURITY, 'Content-Type': `${type}; charset=utf-8` });
  response.end(body);
}

/**
 * Whether the request names this machine. A page on another site can make the
 * browser send requests to 127.0.0.1 under its own host name, and this refuses them.
 */
function fromThisMachine(request, port) {
  const host = request.headers.host ?? '';
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host);
}

/**
 * What the pages show, as places to watch: openspec/ and the coverage map's
 * folder with all they hold, and the not-yet list as one file in its folder.
 */
function watchTargets(root) {
  const targets = [{ folder: join(root, 'openspec'), recursive: true }];
  try {
    const config = loadConfig(root);
    targets.push({ folder: join(root, config.coverage.mapDir), recursive: true });
    const list = join(root, config.baselines.coverage);
    targets.push({ folder: dirname(list), recursive: false, file: basename(list) });
  } catch {
    // No config, or a broken one: openspec/ holds the config, so a fix to it still reloads.
  }
  return targets;
}

/**
 * Start the viewer for the project at `root`. It listens on 127.0.0.1 only. When
 * `port` is taken and `fallback` is true, it takes a free port instead.
 * Resolves to the page's URL and a function that stops the server.
 */
export function startViewer({ root, port = DEFAULT_PORT, fallback = true, watchFiles = true }) {
  const clients = new Set();
  let listening = 0;

  const server = createServer((request, response) => {
    if (!fromThisMachine(request, listening)) return send(response, 403, 'text/plain', 'Open this page at 127.0.0.1.');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return send(response, 405, 'text/plain', 'The viewer only reads.');
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    try {
      if (path === '/events') {
        // A HEAD request gets the headers only, and does not join the open pages.
        if (request.method === 'HEAD') return send(response, 200, 'text/event-stream', '');
        response.writeHead(200, { ...SECURITY, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
        response.write('retry: 2000\n\n');
        clients.add(response);
        request.on('close', () => clients.delete(response));
        return undefined;
      }
      if (path === '/style.css') return send(response, 200, 'text/css', asset('style.css'));
      if (path === '/live.js') return send(response, 200, 'text/javascript', asset('live.js'));
      const view = readView(root);
      if (path === '/') return send(response, 200, 'text/html', renderIndex(view));
      if (path === '/view.json') return send(response, 200, 'application/json', `${JSON.stringify(view, null, 2)}\n`);
      if (path.startsWith('/spec/')) {
        let name;
        try {
          name = decodeURIComponent(path.slice('/spec/'.length));
        } catch {
          return send(response, 400, 'text/plain', 'The address is not valid.');
        }
        const spec = view.specs.find((candidate) => candidate.capability === name);
        if (spec) return send(response, 200, 'text/html', renderSpec(view, spec));
        return send(response, 404, 'text/html', renderNotFound(view, name));
      }
      return send(response, 404, 'text/html', renderNotFound(view, path));
    } catch (error) {
      return send(response, 500, 'text/html', renderError(root, error.message));
    }
  });

  // Tell each open page to reload, once a burst of file events has settled.
  let timer = null;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write('event: change\ndata: reload\n\n');
    }, 150);
  };
  // Each place to watch gets a watcher once its folder exists. A folder made
  // after the start, or named by a changed config, joins on the next look.
  // A folder that went away, or was made again, loses its old watcher first:
  // on Linux, a deleted folder's watcher stays open and sees nothing more. A
  // folder is known by its inode and its birth time, since a file system may
  // give a new folder the inode of one it just deleted.
  const watchers = new Map();
  const problems = [];
  const inode = (folder) => {
    try {
      const stat = statSync(folder);
      return `${stat.ino}:${stat.birthtimeMs}`;
    } catch {
      return null;
    }
  };
  const drop = (key) => {
    watchers.get(key).watcher.close();
    watchers.delete(key);
  };
  const look = (starting) => {
    for (const [key, { folder, ino }] of watchers) {
      if (inode(folder) !== ino) {
        drop(key);
        changed();
      }
    }
    for (const { folder, recursive, file } of watchTargets(root)) {
      const key = `${folder}\u0000${file ?? ''}`;
      const ino = inode(folder);
      if (watchers.has(key) || ino === null) continue;
      try {
        const watcher = watch(folder, { recursive }, (_, name) => {
          if (file === undefined || name === file) changed();
        });
        watcher.on('error', () => (watchers.get(key)?.watcher === watcher ? drop(key) : watcher.close()));
        watchers.set(key, { watcher, folder, ino });
        // A folder that appears may hold what the pages show.
        if (!starting) changed();
      } catch (error) {
        if (starting) problems.push(`${folder}: ${error.message}`);
      }
    }
  };
  const looking = watchFiles ? setInterval(() => look(false), 2000) : null;
  looking?.unref();
  if (watchFiles) look(true);
  // A comment now and then keeps an idle connection open through proxies and sleep.
  const ping = setInterval(() => {
    for (const client of clients) client.write(': ping\n\n');
  }, 30_000);
  ping.unref();

  const release = () => {
    clearInterval(ping);
    clearInterval(looking);
    clearTimeout(timer);
    for (const { watcher } of watchers.values()) watcher.close();
    watchers.clear();
  };
  const stop = () =>
    new Promise((resolve) => {
      release();
      for (const client of clients) client.end();
      clients.clear();
      server.close(() => resolve());
    });

  return new Promise((resolve, reject) => {
    const onListening = () => {
      listening = server.address().port;
      resolve({ url: `http://127.0.0.1:${listening}/`, port: listening, problems, stop });
    };
    // When the server cannot listen, the watchers close too, so the process can end.
    const fail = (error) => {
      release();
      reject(error);
    };
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' && fallback && port !== 0) {
        server.once('error', fail);
        server.listen(0, '127.0.0.1', onListening);
      } else fail(error);
    });
    server.listen(port, '127.0.0.1', onListening);
  });
}

