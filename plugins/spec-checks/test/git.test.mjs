import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { baseCommit, changedFiles, git } from '../lib/git.mjs';
import { tempRepo } from './temp-repo.mjs';

let repo;
beforeEach(() => {
  repo = tempRepo();
  repo.write({ 'README.md': 'start\n' });
});
afterEach(() => repo.remove());

describe('git', () => {
  it('returns the output of a command, or null where it fails', () => {
    const start = repo.commit('Start');
    assert.equal(git(repo.root, ['rev-parse', 'HEAD']), start);
    assert.equal(git(repo.root, ['show', 'HEAD:none.txt']), null);
  });
});

describe('baseCommit', () => {
  it('is the merge base with the first of the refs that exists', () => {
    const start = repo.commit('Start');
    repo.setBase('refs/remotes/origin/trunk');
    repo.commit('On the branch');
    assert.equal(baseCommit(repo.root, ['origin/main', 'origin/trunk']), start);
  });

  it('is null where none of the refs exists', () => {
    repo.commit('Start');
    assert.equal(baseCommit(repo.root, ['origin/main']), null);
  });
});

describe('changedFiles', () => {
  it('holds the files that differ from the base, committed, uncommitted and untracked', () => {
    const base = repo.commit('Start');
    repo.write({ 'loans.md': 'committed\n' });
    repo.commit('Add loans');
    repo.write({ 'README.md': 'changed\n', 'fines.md': 'untracked\n' });
    assert.deepEqual([...changedFiles(repo.root, base)].sort(), ['README.md', 'fines.md', 'loans.md']);
  });
});
