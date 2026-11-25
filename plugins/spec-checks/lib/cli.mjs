/**
 * The spec-checks command line. Each command is a check or a helper. A check
 * returns its problems, and the command line prints them and sets the exit code.
 */
import { spawn, spawnSync } from 'node:child_process';
import { baseOf } from './checks/common.mjs';
import { findRoot, loadConfig } from './config.mjs';
import * as claims from './checks/claims.mjs';
import * as coverage from './checks/coverage.mjs';
import * as dropped from './checks/dropped.mjs';
import * as gate from './checks/gate.mjs';
import { runPreview } from './checks/preview.mjs';
import * as repeated from './checks/repeated.mjs';
import * as shall from './checks/shall.mjs';
import { runDismissed, runGroups } from './checks/sweep.mjs';
import * as validate from './checks/validate.mjs';
import * as vendor from './checks/vendor.mjs';
import { findSpecsRoot } from './view/model.mjs';
import { DEFAULT_PORT, startViewer } from './view/server.mjs';

const CHECKS = { validate: validate.run, coverage: coverage.run, shall: shall.run, dropped: dropped.run, repeated: repeated.run, gate: gate.run };

const USAGE = `usage: spec-checks <command> [--root <dir>] [--write]

Checks, which verify runs as openspec/checks.json lists them:
  validate            openspec validate --specs --strict, less the long requirements the baseline lists
  coverage            every scenario has a test or a reason in the coverage map
  shall               every SHALL sentence has a scenario   (--report lists every gap)
  dropped             no requirement left a main spec without a REMOVED or RENAMED delta
  repeated            no list is in two specs               (--report lists every copy)
  gate --check        no rule was dropped after a change's gate without an override

Helpers:
  verify              every check in checks.json, then each "extra" command
  gate <change>       each requirement of a change at its gate and now   [--gate <commit>]
  claims [<change>]   absolute claims that share the change's glossary terms   [--all]
  preview <change>    the checks on the specs as they will be after the sync
  sweep-groups        every spec is in exactly one sweep group
  sweep-dismissed     the dismissed pairs whose requirements changed since they were listed
  vendor              copy this CLI to tools/spec-checks/ for CI
  view                the specs as web pages on 127.0.0.1, with each scenario's test   [--port <n>] [--open]

--write rewrites one check's baseline as today's gaps, then checks. verify never writes.
--root names the project. The default is the folder at or above this one with openspec/checks.json,
or for view, with openspec/specs.`;

/** Run one check in-process: its problems, or the error it threw as one problem. */
export function runCheck(name, ctx) {
  try {
    return CHECKS[name](ctx);
  } catch (error) {
    return { problems: [], error: error instanceof Error ? error.message : String(error) };
  }
}

const COMMANDS = {
  ...CHECKS,
  claims: claims.run,
  preview: (ctx) => runPreview(ctx, runCheck),
  'sweep-groups': runGroups,
  'sweep-dismissed': runDismissed,
  vendor: vendor.run,
};

/** Print one check's result. True where it passed. */
function report(name, result) {
  if (result.error) {
    console.error(`${name}: ${result.error}`);
    return false;
  }
  if (result.problems.length > 0) {
    if (!result.quiet) {
      console.error(`${name}: ${result.problems.length} problems:`);
      for (const problem of result.problems) console.error(`  ${problem}`);
      if (result.hint) console.error(result.hint);
    }
    return false;
  }
  if (result.summary) console.log(`${name}: ${result.summary}`);
  return true;
}

function verify(ctx) {
  // Find the base once, so its note prints once. In CI with no base, every check would fail the same way.
  try {
    baseOf(ctx);
  } catch (error) {
    console.error(`verify: ${error.message}`);
    return 1;
  }
  let failed = 0;
  for (const name of ctx.config.checks) {
    const started = performance.now();
    const ok = report(name, runCheck(name, { ...ctx, args: [], write: false, fromVerify: true }));
    if (!ok) failed += 1;
    if (process.env.SPEC_CHECKS_TIMES) console.log(`  ${name} took ${Math.round(performance.now() - started)} ms`);
  }
  for (const extra of ctx.config.extra) {
    const command = typeof extra === 'string' ? extra : extra.command;
    const name = typeof extra === 'string' ? extra : (extra.name ?? extra.command);
    const result = spawnSync(command, { cwd: ctx.root, shell: true, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`${name}: failed with exit ${result.status}`);
      failed += 1;
    }
  }
  const total = ctx.config.checks.length + ctx.config.extra.length;
  console.log(failed === 0 ? `verify: ${total} checks pass` : `verify: ${failed} of ${total} checks fail`);
  return failed === 0 ? 0 : 1;
}

/** Open a URL in the default browser, and say nothing when that fails. */
function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

/**
 * `spec-checks view`: start the viewer for the project at or above the folder.
 * It needs openspec/specs, not openspec/checks.json, so it also shows the specs
 * of a project without the checks. It returns at once, and the server keeps the
 * process running until it is stopped.
 */
function view(rest) {
  for (const flag of ['--root', '--port']) {
    const at = rest.indexOf(flag);
    if (at >= 0 && (rest[at + 1] === undefined || rest[at + 1].startsWith('--'))) {
      console.error(`spec-checks: ${flag} needs a value`);
      return 2;
    }
  }
  for (let at = 0; at < rest.length; at += 1) {
    if (rest[at] === '--root' || rest[at] === '--port') at += 1;
    else if (rest[at] !== '--open') {
      console.error(`spec-checks view: ${rest[at]} is not an option of view. It takes --root <folder>, --port <n> and --open`);
      return 2;
    }
  }
  const value = (flag) => (rest.includes(flag) ? rest[rest.indexOf(flag) + 1] : undefined);
  const start = value('--root') ?? process.cwd();
  const root = findSpecsRoot(start);
  if (!root) {
    console.error(`spec-checks view: no openspec/specs at or above ${start}`);
    return 2;
  }
  const portText = value('--port');
  const port = portText === undefined ? DEFAULT_PORT : Number(portText);
  if ((portText !== undefined && !/^\d+$/.test(portText)) || port > 65535) {
    console.error(`spec-checks view: --port takes a number from 0 to 65535, not ${portText}`);
    return 2;
  }
  // A port the user named must be that port. Only the default may move to a free one.
  startViewer({ root, port, fallback: portText === undefined }).then(
    ({ url, problems }) => {
      console.log(`view: ${url}`);
      console.log(`view: the specs of ${root}. Stop the viewer with Ctrl+C.`);
      for (const problem of problems) console.log(`view: pages do not reload on their own: ${problem}`);
      if (rest.includes('--open')) openBrowser(url);
    },
    (error) => {
      const message =
        error.code === 'EADDRINUSE' ? `port ${port} is in use. Name another with --port, or leave out --port.` : error.message;
      console.error(`spec-checks view: ${message}`);
      process.exitCode = 1;
    },
  );
  return 0;
}

export function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(USAGE);
    return command ? 0 : 2;
  }
  if (command === 'view') return view(rest);
  if (command !== 'verify' && !COMMANDS[command]) {
    console.error(`spec-checks: no command ${command}\n\n${USAGE}`);
    return 2;
  }
  const rootAt = rest.indexOf('--root');
  if (rootAt >= 0 && (rest[rootAt + 1] === undefined || rest[rootAt + 1].startsWith('--'))) {
    console.error('spec-checks: --root needs a folder');
    return 2;
  }
  const start = rootAt >= 0 ? rest[rootAt + 1] : process.cwd();
  const args = rootAt >= 0 ? rest.filter((_, at) => at !== rootAt && at !== rootAt + 1) : rest;
  const root = findRoot(start);
  if (!root) {
    console.error(`spec-checks: no openspec/checks.json at or above ${start}. Copy the plugin's templates/openspec/checks.json there to opt in`);
    return 2;
  }
  const ctx = {
    root,
    config: null,
    args,
    write: args.includes('--write'),
    base: undefined,
    note: (line) => console.log(`${command}: ${line}`),
  };
  try {
    ctx.config = loadConfig(root);
  } catch (error) {
    console.error(`spec-checks: ${error.message}`);
    return 2;
  }
  if (command === 'verify') return verify(ctx);
  let result;
  try {
    result = COMMANDS[command](ctx);
  } catch (error) {
    result = { problems: [], error: error instanceof Error ? error.message : String(error) };
  }
  return report(command, result) ? 0 : 1;
}
