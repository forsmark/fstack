import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirOfCommand, findRoot, linkedChanges, normalize, prefixOf, startOf, taskIdOf, touchesPlans } from '../hooks/plan-sync.mjs';

const HOOK = fileURLToPath(new URL('../hooks/plan-sync.mjs', import.meta.url));
const BACKLOG = process.env.BACKLOG_BIN || 'backlog';
const HAS_BACKLOG = spawnSync(BACKLOG, ['--version'], { encoding: 'utf8' }).status === 0;

// Git reads no config of this machine, and every commit has the same author.
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
delete ENV.BACKLOG_CWD;

const tempFolder = () => mkdtempSync(join(tmpdir(), 'backlog-plan-sync-'));

/** Runs the hook on `payload` as Claude Code does: the payload on stdin. */
const runHook = (payload, env = {}) =>
  spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...ENV, ...env } });

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
  assert.equal(result.status, 0, result.stderr);
};

/** Points HEAD of `cwd` at `branch`, also before the first commit. */
const onBranch = (cwd, branch) => git(cwd, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);

/** Writes the tasks.md of `change` under `root`. */
function writeTasks(root, change, text) {
  mkdirSync(join(root, 'openspec', 'changes', change), { recursive: true });
  writeFileSync(join(root, 'openspec', 'changes', change, 'tasks.md'), text);
}

/** Writes a minimal Backlog.md config, enough for the hook to find the root. */
function writeConfig(root) {
  mkdirSync(join(root, 'backlog'), { recursive: true });
  writeFileSync(join(root, 'backlog', 'config.yml'), 'project_name: "t"\n');
}

/** An Edit payload for the tasks.md of `change` under `root`. */
const editOf = (root, change) => ({
  cwd: root,
  tool_name: 'Edit',
  tool_input: { file_path: join(root, 'openspec', 'changes', change, 'tasks.md') },
});

const bashOf = (cwd, command) => ({ cwd, tool_name: 'Bash', tool_input: { command } });

describe('touchesPlans', () => {
  const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } });
  const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

  it("holds for a file tool on an open change's tasks.md", () => {
    assert.ok(touchesPlans(edit('/repo/openspec/changes/login-copy/tasks.md')));
    assert.ok(touchesPlans(edit('openspec/changes/login-copy/tasks.md')));
  });

  it('does not hold for an archived change or another file of a change', () => {
    assert.ok(!touchesPlans(edit('/repo/openspec/changes/archive/2026-11-24-login-copy/tasks.md')));
    assert.ok(!touchesPlans(edit('/repo/openspec/changes/login-copy/proposal.md')));
    assert.ok(!touchesPlans(edit('/repo/docs/tasks.md')));
  });

  it('holds for a command that names a tasks.md or a change folder', () => {
    assert.ok(touchesPlans(bash("sed -i 's/- \\[ \\]/- [x]/' openspec/changes/login-copy/tasks.md")));
    assert.ok(touchesPlans(bash('backlog task edit TASK-3 --add-ref openspec/changes/login-copy')));
  });

  it('holds for a git command that can bring another tasks.md', () => {
    assert.ok(touchesPlans(bash('git merge main')));
    assert.ok(touchesPlans(bash('git -C ../wt rebase main')));
    assert.ok(touchesPlans(bash('git switch -c task-12 main')));
  });

  it('does not hold for a git command that only goes back to a committed tasks.md', () => {
    assert.ok(!touchesPlans(bash('git stash')));
    assert.ok(!touchesPlans(bash('git -C ../wt stash pop')));
    assert.ok(!touchesPlans(bash('git reset --hard')));
    assert.ok(!touchesPlans(bash('git restore --staged .')));
  });

  it('does not hold for other commands', () => {
    assert.ok(!touchesPlans(bash('openspec instructions apply --change login-copy --json')));
    assert.ok(!touchesPlans(bash('git status --short')));
    assert.ok(!touchesPlans(bash('git log --oneline -5')));
    assert.ok(!touchesPlans({}));
  });
});

describe('dirOfCommand', () => {
  it('reads a leading cd, bare or quoted', () => {
    assert.equal(dirOfCommand('cd /repo/wt && sed -i s/a/b/ openspec/changes/a/tasks.md'), '/repo/wt');
    assert.equal(dirOfCommand('cd "../my wt" && ls'), '../my wt');
    assert.equal(dirOfCommand("cd '/a b'; ls"), '/a b');
    assert.equal(dirOfCommand('cd ~/wt && ls'), join(homedir(), 'wt'));
  });

  it('reads git -C', () => {
    assert.equal(dirOfCommand('git -C /repo/wt merge main'), '/repo/wt');
  });

  it('reads nothing from a command without a folder, or with a cd that is not first', () => {
    assert.equal(dirOfCommand('ls openspec/changes'), null);
    assert.equal(dirOfCommand('echo cd /x && ls'), null);
  });
});

describe('startOf', () => {
  it("takes a file tool's folder, absolute or relative to its cwd", () => {
    assert.equal(startOf({ cwd: '/repo', tool_input: { file_path: '/repo/openspec/changes/a/tasks.md' } }), '/repo/openspec/changes/a');
    assert.equal(startOf({ cwd: '/repo', tool_input: { file_path: 'openspec/changes/a/tasks.md' } }), '/repo/openspec/changes/a');
  });

  it('takes the folder a shell command names, absolute or relative to its cwd', () => {
    assert.equal(startOf({ cwd: '/repo', tool_input: { command: 'cd /wt/task-1 && cat tasks.md' } }), '/wt/task-1');
    assert.equal(startOf({ cwd: '/repo', tool_input: { command: 'cd ../wt/task-1 && cat tasks.md' } }), '/wt/task-1');
  });

  it("takes a shell command's cwd when the command names no folder", () => {
    assert.equal(startOf({ cwd: '/repo/worktree', tool_input: { command: 'cat tasks.md' } }), '/repo/worktree');
  });
});

describe('taskIdOf', () => {
  it('names the task of a task branch', () => {
    assert.equal(taskIdOf('task-12', 'task'), 'TASK-12');
    assert.equal(taskIdOf('task-12.1', 'task'), 'TASK-12.1');
    assert.equal(taskIdOf('back-7', 'back'), 'BACK-7');
  });

  it('names no task for another branch', () => {
    assert.equal(taskIdOf('main', 'task'), null);
    assert.equal(taskIdOf('task-12-fix', 'task'), null);
    assert.equal(taskIdOf('feature/task-12', 'task'), null);
    assert.equal(taskIdOf(null, 'task'), null);
  });
});

describe('prefixOf', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads task_prefix from the config, and is task without it', () => {
    writeConfig(root);
    assert.equal(prefixOf(root), 'task');
    writeFileSync(join(root, 'backlog', 'config.yml'), 'project_name: "t"\ntask_prefix: "back"\n');
    assert.equal(prefixOf(root), 'back');
  });
});

describe('normalize', () => {
  it('puts a plan in the form Backlog.md stores it', () => {
    assert.equal(normalize('\n- [ ] 1.1 a\r\n\r\n\r\n\r\n- [ ] 1.2 b\r\n'), '- [ ] 1.1 a\n\n- [ ] 1.2 b');
  });
});

describe('linkedChanges', () => {
  it('names the open changes a task links, and skips archived changes and other references', () => {
    const task = {
      references: [
        'openspec/changes/login-copy',
        './openspec/changes/rate-limit/',
        'openspec/changes/archive/2026-11-24-old',
        'https://example.com/thread/1',
        'src/login.ts',
      ],
    };
    assert.deepEqual(linkedChanges(task), ['login-copy', 'rate-limit']);
    assert.deepEqual(linkedChanges({}), []);
  });
});

describe('findRoot', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds the nearest folder with backlog/config.yml', () => {
    mkdirSync(join(root, 'openspec', 'changes', 'a'), { recursive: true });
    assert.equal(findRoot(join(root, 'openspec', 'changes', 'a')), null);
    writeConfig(root);
    assert.equal(findRoot(join(root, 'openspec', 'changes', 'a')), root);
    assert.equal(findRoot(join(root, 'backlog')), root);
  });

  it('finds a root with backlog.config.yml or .backlog/config.yml', () => {
    writeFileSync(join(root, 'backlog.config.yml'), 'backlog_directory: work\n');
    assert.equal(findRoot(root), root);
    const other = tempFolder();
    try {
      mkdirSync(join(other, '.backlog'));
      writeFileSync(join(other, '.backlog', 'config.yml'), 'project_name: "t"\n');
      assert.equal(findRoot(other), other);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('the hook without the backlog CLI', () => {
  let root;
  beforeEach(() => {
    root = tempFolder();
    git(root, 'init', '-q', '-b', 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('does nothing in a project without a Backlog.md config', () => {
    const result = runHook(editOf(root, 'login-copy'), { BACKLOG_BIN: join(root, 'no-such-backlog') });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  });

  it('does nothing on a branch that names no task, and so runs no backlog command', () => {
    writeConfig(root);
    onBranch(root, 'main');
    const result = runHook(editOf(root, 'login-copy'), { BACKLOG_BIN: join(root, 'no-such-backlog') });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout + result.stderr, '');
  });

  it('reports a missing backlog CLI on a task branch', () => {
    writeConfig(root);
    const result = runHook(editOf(root, 'login-copy'), { BACKLOG_BIN: join(root, 'no-such-backlog') });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan of TASK-1 was not copied: the backlog CLI is not on PATH/);
  });

  it('reports a backlog command that fails', () => {
    writeConfig(root);
    const failing = join(root, 'failing-backlog');
    writeFileSync(failing, '#!/bin/sh\necho "the disk is full" >&2\nexit 3\n');
    chmodSync(failing, 0o755);
    const result = runHook(editOf(root, 'login-copy'), { BACKLOG_BIN: failing });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /plan of TASK-1 was not copied: backlog task view TASK-1 failed: the disk is full/);
  });

  it('ignores a payload it cannot read', () => {
    const result = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
    assert.equal(result.status, 0);
  });
});

describe('the hook with the backlog CLI', { skip: HAS_BACKLOG ? false : 'needs the backlog CLI on PATH, or BACKLOG_BIN' }, () => {
  let root;
  const worktrees = [];

  /** Runs backlog in `cwd` and returns its stdout. */
  const backlog = (cwd, ...args) => {
    const result = spawnSync(BACKLOG, args, { cwd, encoding: 'utf8', env: ENV });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const viewOf = (cwd, id) => JSON.parse(backlog(cwd, 'task', 'view', id, '--json')).task;
  const pathOf = (cwd, id) => join(cwd, viewOf(cwd, id).path);

  /** Commits everything on the current branch, then claims `branch` in a new worktree and returns its path. */
  function claim(branch) {
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'File the tasks');
    const worktree = `${root}-${branch}`;
    worktrees.push(worktree);
    git(root, 'worktree', 'add', '-q', '-b', branch, worktree);
    return worktree;
  }

  /** Sets the task file's updated_date to a past date, so a rewrite shows. */
  function age(file) {
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^updated_date: .*$/m, "updated_date: '2000-01-01 00:00'"));
    return readFileSync(file, 'utf8');
  }

  beforeEach(() => {
    root = tempFolder();
    git(root, 'init', '-q', '-b', 'main');
    backlog(root, 'init', 'test', '--defaults', '--integration-mode', 'none', '--include-remote', 'false');
  });
  afterEach(() => {
    for (const worktree of worktrees.splice(0)) rmSync(worktree, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  it('copies tasks.md into the plan of the task its branch names, and tells Claude', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '## 1. Copy\n\n- [x] 1.1 Add `errors.invalid`\n- [ ] 1.2 Show the field\n');
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, '## 1. Copy\n\n- [x] 1.1 Add `errors.invalid`\n- [ ] 1.2 Show the field');
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'PostToolUse');
    assert.match(output.additionalContext, /plan of TASK-1 now matches openspec\/changes\/login-copy\/tasks\.md/);
    assert.ok(output.additionalContext.includes(`The task file ${pathOf(root, 'TASK-1')} changed`));
  });

  it('copies after a failed call too, and answers for that event', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [x] 1.1 Change the copy\n');
    const payload = { ...bashOf(root, "sed -i 's/a/b/' openspec/changes/login-copy/tasks.md && npm test"), hook_event_name: 'PostToolUseFailure', error: 'Command exited with non-zero status code 1' };
    const result = runHook(payload);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, '- [x] 1.1 Change the copy');
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'PostToolUseFailure');
  });

  it('tries again while another process holds the task', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    // A backlog that answers the first two edits as Backlog.md does while another process holds the lock.
    const counter = join(root, 'locked-tries');
    const locked = join(root, 'locked-backlog');
    writeFileSync(locked, [
      '#!/bin/sh',
      'if [ "$1 $2" = "task edit" ]; then',
      '  n=$(cat "$COUNTER" 2>/dev/null || echo 0)',
      '  if [ "$n" -lt 2 ]; then',
      '    echo $((n + 1)) > "$COUNTER"',
      '    echo "Edit failed: TASK-1 is being modified by another process; retry if appropriate." >&2',
      '    exit 1',
      '  fi',
      'fi',
      'exec "$REAL_BACKLOG" "$@"',
      '',
    ].join('\n'));
    chmodSync(locked, 0o755);
    const result = runHook(editOf(root, 'login-copy'), { BACKLOG_BIN: locked, COUNTER: counter, REAL_BACKLOG: BACKLOG });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(counter, 'utf8').trim(), '2');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
  });

  it('copies on a subtask branch', () => {
    backlog(root, 'task', 'create', 'Sign in');
    backlog(root, 'task', 'create', 'Reword the login errors', '-p', 'TASK-1', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1.1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    assert.equal(runHook(editOf(root, 'login-copy')).status, 0);
    assert.equal(viewOf(root, 'TASK-1.1').implementationPlan, '- [ ] 1.1 Change the copy');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it("copies on a task branch of the project's own prefix", () => {
    const other = tempFolder();
    try {
      git(other, 'init', '-q', '-b', 'main');
      backlog(other, 'init', 'other', '--defaults', '--integration-mode', 'none', '--include-remote', 'false', '--task-prefix', 'back');
      backlog(other, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
      onBranch(other, 'back-1');
      writeTasks(other, 'login-copy', '- [ ] 1.1 Change the copy\n');
      assert.equal(runHook(editOf(other, 'login-copy')).status, 0);
      assert.equal(viewOf(other, 'BACK-1').implementationPlan, '- [ ] 1.1 Change the copy');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('leaves a task alone whose linked change folder is gone', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'archive/2026-11-24-login-copy', '- [x] 1.1 Change the copy\n');
    const result = runHook(bashOf(root, 'openspec archive login-copy --yes && ls openspec/changes/'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('leaves an archived task alone', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    backlog(root, 'task', 'archive', 'TASK-1');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('copies for a file path relative to the cwd, and for a plan that starts with a dash', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook({ cwd: root, tool_name: 'Write', tool_input: { file_path: 'openspec/changes/login-copy/tasks.md' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
  });

  it('copies nothing on a branch that names no task', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('leaves the task file of another task alone', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    backlog(root, 'task', 'create', 'Limit the attempts', '--ref', 'openspec/changes/rate-limit');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const worktree = claim('task-2');
    const before = readFileSync(pathOf(worktree, 'TASK-1'), 'utf8');
    writeTasks(worktree, 'rate-limit', '- [ ] 1.1 Count the attempts\n');
    const result = runHook(editOf(worktree, 'rate-limit'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(worktree, 'TASK-2').implementationPlan, '- [ ] 1.1 Count the attempts');
    assert.equal(readFileSync(pathOf(worktree, 'TASK-1'), 'utf8'), before);
    // An edit of TASK-1's own change on task-2 leaves TASK-1 alone too.
    writeTasks(worktree, 'login-copy', '- [x] 1.1 Change the copy\n');
    assert.equal(runHook(editOf(worktree, 'login-copy')).status, 0);
    assert.equal(readFileSync(pathOf(worktree, 'TASK-1'), 'utf8'), before);
  });

  it('leaves the task file as it is when the plan matches in the form Backlog.md stores', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\r\n\r\n\r\n\r\n- [ ] 1.2 Show the field\r\n');
    assert.equal(runHook(editOf(root, 'login-copy')).status, 0);
    const before = age(pathOf(root, 'TASK-1'));
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(readFileSync(pathOf(root, 'TASK-1'), 'utf8'), before);
  });

  it('leaves a task alone that links no change or only an archived one', () => {
    backlog(root, 'task', 'create', 'No link');
    backlog(root, 'task', 'create', 'Old link', '--ref', 'openspec/changes/archive/2026-11-24-login-copy');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    writeTasks(root, 'archive/2026-11-24-login-copy', '- [x] 1.1 Done long ago\n');
    for (const [branch, id] of [['task-1', 'TASK-1'], ['task-2', 'TASK-2']]) {
      onBranch(root, branch);
      assert.equal(runHook(editOf(root, 'login-copy')).status, 0);
      assert.equal(viewOf(root, id).implementationPlan, null);
    }
  });

  it('does nothing on a task branch whose task does not exist', () => {
    onBranch(root, 'task-99');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout + result.stderr, '');
  });

  it('copies the plan when a shell command adds the link', () => {
    backlog(root, 'task', 'create', 'Reword the login errors');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    backlog(root, 'task', 'edit', 'TASK-1', '--add-ref', 'openspec/changes/login-copy');
    const result = runHook(bashOf(root, 'backlog task edit TASK-1 --add-ref openspec/changes/login-copy'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
  });

  it("writes to the worktree's copy of the task and leaves the main checkout's copy alone", () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    const worktree = claim('task-1');
    writeTasks(worktree, 'login-copy', '- [ ] 1.1 Change the copy\n');
    // The session's cwd is the main checkout, and the edited file is in the worktree.
    const result = runHook({ ...editOf(worktree, 'login-copy'), cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(worktree, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('follows a leading cd from the main checkout into the worktree', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    const worktree = claim('task-1');
    writeTasks(worktree, 'login-copy', '- [x] 1.1 Change the copy\n');
    const result = runHook(bashOf(root, `cd ${worktree} && sed -i 's/- \\[ \\]/- [x]/' openspec/changes/login-copy/tasks.md`));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(worktree, 'TASK-1').implementationPlan, '- [x] 1.1 Change the copy');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('copies after a git command that can bring another tasks.md', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    const worktree = claim('task-1');
    writeTasks(worktree, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook(bashOf(worktree, 'git merge main'));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(worktree, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
  });

  it('follows git -C from the main checkout into the worktree', () => {
    backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
    const worktree = claim('task-1');
    writeTasks(worktree, 'login-copy', '- [ ] 1.1 Change the copy\n');
    const result = runHook(bashOf(root, `git -C ${worktree} merge main`));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(viewOf(worktree, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });

  it('works in the project of the edit when BACKLOG_CWD names another project', () => {
    const other = tempFolder();
    try {
      git(other, 'init', '-q', '-b', 'main');
      backlog(other, 'init', 'other', '--defaults', '--integration-mode', 'none', '--include-remote', 'false');
      backlog(root, 'task', 'create', 'Reword the login errors', '--ref', 'openspec/changes/login-copy');
      onBranch(root, 'task-1');
      writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
      const result = runHook(editOf(root, 'login-copy'), { BACKLOG_CWD: other });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(viewOf(root, 'TASK-1').implementationPlan, '- [ ] 1.1 Change the copy');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('reports a task that links two open changes, and copies neither', () => {
    backlog(root, 'task', 'create', 'Two links', '--ref', 'openspec/changes/login-copy,openspec/changes/rate-limit');
    onBranch(root, 'task-1');
    writeTasks(root, 'login-copy', '- [ ] 1.1 Change the copy\n');
    writeTasks(root, 'rate-limit', '- [ ] 1.1 Count the attempts\n');
    const result = runHook(editOf(root, 'login-copy'));
    assert.equal(result.status, 2);
    assert.match(result.stderr, /TASK-1 links 2 open changes/);
    assert.equal(viewOf(root, 'TASK-1').implementationPlan, null);
  });
});
