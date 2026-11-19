#!/usr/bin/env node
/**
 * The OpenSpec state of every repo under a folder: which skills it has, their
 * version and scope, its git state, and whether it opted in to spec-checks.
 * It keeps no list of its own: the repos are the record.
 *
 *   node status.mjs [<folder>]     the default folder is ~/dev
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SKILL_PREFIX = 'openspec-';

/** This skill's own folder, which install.sh links into ~/.claude/skills. It is no OpenSpec skill. */
const OWN_NAME = 'openspec-migrate';

/**
 * The file OpenSpec 2.x writes beside the skills it owns. 2.x skills carry no
 * `generatedBy` line, so this file is how a 2.x install shows.
 */
const TARGET_FILE = '.openspec-target';

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

/** The OpenSpec version that generated the skills in a folder, as one or more versions, or none. */
function skillVersions(folder) {
  if (!existsSync(folder)) return [];
  const versions = new Set();
  for (const name of readdirSync(folder)) {
    if (!name.startsWith(SKILL_PREFIX) || name === OWN_NAME) continue;
    const file = join(folder, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const match = /generatedBy:\s*"?([\d.]+)"?/.exec(readFileSync(file, 'utf8'));
    versions.add(match ? match[1] : existsSync(join(folder, TARGET_FILE)) ? '2.x' : 'unmarked');
  }
  return [...versions].sort();
}

/** How a repo holds its skills: as plain folders, as links into .agents/skills, or not at all. */
function skillsLayout(repo) {
  const folder = join(repo, '.claude', 'skills');
  if (!existsSync(folder)) return 'none';
  const names = readdirSync(folder).filter((name) => name.startsWith(SKILL_PREFIX) && name !== OWN_NAME);
  if (names.length === 0) return 'none';
  const linked = names.filter((name) => lstatSync(join(folder, name)).isSymbolicLink()).length;
  if (linked === names.length) return 'linked to .agents/skills';
  return linked === 0 ? 'in .claude/skills' : 'mixed';
}

function repoState(repo) {
  const config = join(repo, 'openspec', 'config.yaml');
  const scope = existsSync(config) ? (/^skillsScope:\s*(\w+)/m.exec(readFileSync(config, 'utf8'))?.[1] ?? 'unset') : 'no config.yaml';
  const commands = join(repo, '.claude', 'commands', 'opsx');
  const isGit = git(repo, ['rev-parse', '--is-inside-work-tree']) === 'true';
  const dirty = isGit ? (git(repo, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length : null;
  const skills = skillVersions(join(repo, '.agents', 'skills'));
  return {
    repo,
    skills: skills.length > 0 ? skills : skillVersions(join(repo, '.claude', 'skills')),
    layout: skillsLayout(repo),
    skillsScope: scope,
    opsxCommands: existsSync(commands) ? readdirSync(commands).length : 0,
    git: isGit ? `${git(repo, ['branch', '--show-current']) || 'detached'}, ${dirty === 0 ? 'clean' : `${dirty} uncommitted paths`}` : 'not a git repo',
    checks: existsSync(join(repo, 'openspec', 'checks.json')),
  };
}

/** Whether a repo is done: 2.x skills in .agents/skills, linked from .claude/skills, with the scope recorded. */
const migrated = (state) =>
  state.skills.length === 1 && state.skills[0] === '2.x' && state.layout === 'linked to .agents/skills' && state.skillsScope === 'project';

const root = process.argv[2] ?? join(homedir(), 'dev');
const repos = readdirSync(root)
  .map((name) => join(root, name))
  .filter((path) => existsSync(join(path, 'openspec')))
  .sort();

const globalSkills = [
  ...new Set([...skillVersions(join(homedir(), '.agents', 'skills')), ...skillVersions(join(homedir(), '.claude', 'skills'))]),
];
const cli = spawnSync('openspec', ['--version'], { encoding: 'utf8' });
console.log(`openspec CLI: ${cli.status === 0 ? cli.stdout.trim() : 'not on the PATH'}`);
console.log(`global skills in ~/.agents/skills or ~/.claude/skills: ${globalSkills.length > 0 ? globalSkills.join(', ') : 'none'}`);
console.log('');
const states = repos.map(repoState);
for (const state of states) {
  const versions = [...new Set(state.skills)].join(', ') || 'none';
  console.log(`${state.repo}${migrated(state) ? '   migrated' : ''}`);
  console.log(`  skills: ${versions}, ${state.layout}, skillsScope ${state.skillsScope}`);
  console.log(`  old /opsx command files: ${state.opsxCommands}`);
  console.log(`  git: ${state.git}`);
  console.log(`  spec-checks: ${state.checks ? 'openspec/checks.json' : 'not opted in'}`);
}
console.log('');
const left = states.filter((state) => !migrated(state)).length;
console.log(left === 0 ? 'Every repo is migrated. The last stage can start.' : `${left} of ${states.length} repos are not migrated yet.`);
