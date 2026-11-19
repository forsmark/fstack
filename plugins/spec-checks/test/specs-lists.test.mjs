import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { listAt, listLines, readList, writeList } from '../lib/specs/lists.mjs';
import { tempRepo } from './temp-repo.mjs';

let repo;
beforeEach(() => {
  repo = tempRepo();
});
afterEach(() => repo.remove());

describe('listLines', () => {
  it('drops blank lines and comments, and trims each line', () => {
    assert.deepEqual(listLines('# A comment\n\n  loans › A loan lasts three weeks  \n'), [
      'loans › A loan lasts three weeks',
    ]);
  });
});

describe('readList and writeList', () => {
  it('reads no lines from a list that is absent', () => {
    assert.deepEqual(readList(join(repo.root, 'none.txt')), []);
  });

  it('rewrites a list as new lines and keeps its comments', () => {
    const path = join(repo.root, 'list.txt');
    repo.write({ 'list.txt': '# Today\'s gaps.\nholds › old line\n' });
    writeList(path, ['holds › new line']);
    assert.equal(readFileSync(path, 'utf8'), "# Today's gaps.\nholds › new line\n");
  });
});

describe('listAt', () => {
  it('reads a list as a commit had it, or null where the commit has no such file', () => {
    repo.write({ 'list.txt': 'holds › at the commit\n' });
    const commit = repo.commit('Add the list');
    repo.write({ 'list.txt': 'holds › now\n' });
    assert.deepEqual(listAt(repo.root, commit, 'list.txt'), ['holds › at the commit']);
    assert.equal(listAt(repo.root, commit, 'other.txt'), null);
  });
});
