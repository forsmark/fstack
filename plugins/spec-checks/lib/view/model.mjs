/**
 * What the spec viewer shows: each main spec with its purpose, its requirements
 * and their scenarios, and each scenario's entry in the coverage map. It reads
 * files and runs nothing, so a page can rebuild it on every change.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CONFIG_FILE, loadConfig } from '../config.mjs';
import { mainSpecs, SPECS } from '../checks/common.mjs';
import { kindOf, splitReference } from '../plans/coverage.mjs';
import { readList } from '../specs/lists.mjs';
import { readRequirements, shallSentences } from '../specs/requirements.mjs';

/**
 * A scenario step: a list item that starts with a bold keyword, as
 * `- **WHEN** a member asks`. A colon may follow the keyword, inside the bold or after it.
 */
const STEP = /^\s*(?:[-*+]|\d+[.)])\s+\*\*(GIVEN|WHEN|THEN|AND|BUT):?\*\*:?\s*(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * A scenario's lines as steps, in order. A step's keyword is null where its line
 * has none. A line with no list marker continues the step above it.
 */
export function readSteps(lines) {
  const steps = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    const step = STEP.exec(line);
    const item = LIST_ITEM.exec(line);
    if (step) steps.push({ keyword: step[1], text: step[2].trim() });
    else if (item) steps.push({ keyword: null, text: item[1].trim() });
    else if (steps.length > 0) steps.at(-1).text = `${steps.at(-1).text} ${line.trim()}`.trim();
    else steps.push({ keyword: null, text: line.trim() });
  }
  return steps;
}

/** The lines under a level-two heading, up to the next heading of level one or two. */
function section(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${name}`);
  if (start < 0) return [];
  const end = lines.findIndex((line, at) => at > start && /^#{1,2} /.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

/** Lines without the blank lines at either end. */
function trimLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/**
 * One scenario's coverage, as the viewer shows it:
 * - `e2e` or `unit`, with the test's file and title;
 * - `none`, with the reason it has no test;
 * - `not-yet`, where the not-yet list holds it and the map does not;
 * - `missing`, where neither holds it, which the coverage check refuses;
 * - `invalid`, where the map's entry has no kind the check accepts;
 * - `conflict`, where the map holds it and the not-yet list still does too,
 *   which the coverage check refuses. `mapped` holds the map's entry.
 * A `checked` reason comes along where the entry has one.
 */
export function coverageOf(entry, onNotYetList) {
  if (entry === undefined) return { kind: onNotYetList ? 'not-yet' : 'missing' };
  const kind = kindOf(entry);
  if (!kind) return { kind: 'invalid' };
  const checked = typeof entry.checked === 'string' ? { checked: entry.checked } : {};
  let mapped;
  if (kind === 'none') mapped = { kind, reason: String(entry.none), ...checked };
  else {
    const [file, title] = splitReference(String(entry[kind]));
    mapped = { kind, file, title, ...checked };
  }
  // The coverage check fails on a scenario that is mapped and still on the not-yet list.
  return onNotYetList ? { kind: 'conflict', mapped } : mapped;
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A scenario's entry in a capability's map, or undefined. Only the map's own
 * keys count, as for the coverage check, so a scenario named `constructor` has none.
 */
function entryOf(map, requirement, scenario) {
  const entries = Object.hasOwn(map, requirement) ? map[requirement] : undefined;
  return isPlainObject(entries) && Object.hasOwn(entries, scenario) ? entries[scenario] : undefined;
}

/**
 * One spec as the viewer shows it. `map` is the spec's coverage map, as
 * requirement → scenario → entry, or null where the project tracks no coverage.
 * `notYet` is the set of scenario keys on the not-yet list.
 */
export function specView(capability, text, map = null, notYet = new Set()) {
  const title = /^# (.+)$/m.exec(text)?.[1].trim() ?? capability;
  return {
    capability,
    title,
    purpose: trimLines(section(text, 'Purpose')),
    requirements: readRequirements(capability, text).map((requirement) => ({
      name: requirement.name,
      key: requirement.key,
      body: trimLines(requirement.body),
      shall: shallSentences(requirement).length,
      scenarios: requirement.scenarios.map((scenario) => ({
        name: scenario.name,
        key: scenario.key,
        steps: readSteps(scenario.lines),
        coverage: map === null ? null : coverageOf(entryOf(map, requirement.name, scenario.name), notYet.has(scenario.key)),
      })),
    })),
  };
}

/** A capability's coverage map, or an error where its file does not parse or holds no object. */
function readMapFile(path) {
  if (!existsSync(path)) return { map: {} };
  let map;
  try {
    map = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { map: {}, error: error.message };
  }
  return isPlainObject(map) ? { map } : { map: {}, error: 'holds no object of requirement → scenario → entry' };
}

/** The counts the viewer's summary shows. */
function summaryOf(specs) {
  const scenarios = specs.flatMap((spec) => spec.requirements.flatMap((requirement) => requirement.scenarios));
  const coverage = {};
  for (const scenario of scenarios) {
    if (scenario.coverage) coverage[scenario.coverage.kind] = (coverage[scenario.coverage.kind] ?? 0) + 1;
  }
  return {
    specs: specs.length,
    requirements: specs.reduce((sum, spec) => sum + spec.requirements.length, 0),
    scenarios: scenarios.length,
    coverage,
  };
}

/**
 * The main specs of the project at `root`. Where the project has
 * openspec/checks.json, each scenario carries its coverage. Where it has none,
 * or the file does not load, coverage is null throughout, and the view still
 * shows the specs. Each file that does not load is in `errors`. `configFound`
 * says whether openspec/checks.json exists, so a page can tell a missing
 * config from one that does not load.
 */
export function readView(root) {
  const errors = [];
  let config = null;
  const configFound = existsSync(join(root, CONFIG_FILE));
  if (configFound) {
    try {
      config = loadConfig(root);
    } catch (error) {
      // The specs still show. Coverage needs the config, so it shows nowhere.
      errors.push(error.message);
    }
  }
  const tracked = config !== null;
  const notYet = new Set(tracked ? readList(join(root, config.baselines.coverage)) : []);
  const specs = mainSpecs(root).map(({ capability, text }) => {
    if (!tracked) return specView(capability, text);
    const file = `${config.coverage.mapDir}/${capability}.json`;
    const { map, error } = readMapFile(join(root, file));
    if (error) errors.push(`${file}: ${error}`);
    return specView(capability, text, map, notYet);
  });
  return { root, coverageTracked: tracked, configFound, specs, summary: summaryOf(specs), errors };
}

/** The folder at or above `start` that holds openspec/specs, or null. */
export function findSpecsRoot(start) {
  let folder = resolve(start);
  for (;;) {
    if (existsSync(join(folder, SPECS))) return folder;
    const parent = dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}
