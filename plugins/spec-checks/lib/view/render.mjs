/**
 * The viewer's pages as HTML strings: the index of specs, one page per spec, and
 * the page for a spec that does not exist. The data comes from model.mjs.
 */
import { basename } from 'node:path';
import { blocks, escapeHtml, inline } from './markdown.mjs';

/** Each coverage kind: how the page names it, and the state its colour shows. */
export const KINDS = {
  e2e: { label: 'End-to-end test', state: 'tested' },
  unit: { label: 'Unit test', state: 'tested' },
  none: { label: 'No test, with a reason', state: 'reason' },
  'not-yet': { label: 'Not mapped yet', state: 'pending' },
  missing: { label: 'Missing from the coverage map', state: 'gap' },
  invalid: { label: 'Map entry not valid', state: 'gap' },
  conflict: { label: 'Mapped, and still on the not-yet list', state: 'gap' },
};

const ORDER = Object.keys(KINDS);

const plural = (count, one, many = `${one}s`) => `${count.toLocaleString('en')} ${count === 1 ? one : many}`;

/** A heading's anchor: its letters and digits in lower case, joined by hyphens. */
export const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'section';

/** Anchors for a list of names. Each is new to `taken`, the page's ids so far, and joins it. */
function anchors(names, taken, prefix = '') {
  return names.map((name) => {
    const base = `${prefix}${slug(name)}`;
    let id = base;
    for (let count = 2; taken.has(id); count += 1) id = `${base}-${count}`;
    taken.add(id);
    return id;
  });
}

const scenariosOf = (spec) => spec.requirements.flatMap((requirement) => requirement.scenarios);

/** How many scenarios have each coverage kind. */
function countKinds(scenarios) {
  const counts = {};
  for (const scenario of scenarios) {
    if (scenario.coverage) counts[scenario.coverage.kind] = (counts[scenario.coverage.kind] ?? 0) + 1;
  }
  return counts;
}

/** A bar with one segment for each coverage kind, as wide as its share. */
function coverageBar(counts, className = 'bar') {
  const total = ORDER.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0);
  if (total === 0) return '';
  let x = 0;
  const parts = [];
  for (const kind of ORDER) {
    const count = counts[kind] ?? 0;
    if (count === 0) continue;
    const width = (count / total) * 100;
    parts.push(
      `<rect class="fill-${kind}" x="${x.toFixed(3)}" y="0" width="${width.toFixed(3)}" height="1"><title>${escapeHtml(
        `${KINDS[kind].label}: ${count}`,
      )}</title></rect>`,
    );
    x += width;
  }
  const label = ORDER.filter((kind) => counts[kind]).map((kind) => `${KINDS[kind].label}: ${counts[kind]}`).join(', ');
  return `<svg class="${className}" viewBox="0 0 100 1" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}">${parts.join('')}</svg>`;
}

/** The legend under the index's bar: each kind with its count. */
function legend(counts) {
  return `<ul class="legend">${ORDER.filter((kind) => counts[kind])
    .map(
      (kind) =>
        `<li><span class="swatch fill-${kind}" aria-hidden="true"></span>${escapeHtml(KINDS[kind].label)} <span class="count">${counts[kind].toLocaleString('en')}</span></li>`,
    )
    .join('')}</ul>`;
}

/** The ids that the layout and the index use. */
const LAYOUT_IDS = ['live', 'filter'];

/** The whole page around a body. */
export function layout({ title, project, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/style.css">
<script src="/live.js" defer></script>
</head>
<body>
<header class="masthead">
<a class="home" href="/">${escapeHtml(project)}<span class="home-note"> specs</span></a>
<span class="live" id="live" data-state="connecting" role="status">Connecting</span>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}

const projectOf = (view) => basename(view.root);

/** The first paragraph of a spec's purpose, as one line. */
function purposeLine(purpose) {
  const end = purpose.findIndex((line) => line.trim() === '');
  return (end < 0 ? purpose : purpose.slice(0, end)).join(' ').trim();
}

export function renderIndex(view) {
  const project = projectOf(view);
  const { summary } = view;
  const notes = [];
  // A config that exists and does not load is in the errors below, with its reason.
  if (!view.coverageTracked && !view.configFound) {
    notes.push('<p class="note">This project has no openspec/checks.json, so the pages show no test coverage.</p>');
  }
  if (view.errors.length > 0) {
    notes.push(
      `<div class="problems"><p>These files do not load. A spec whose coverage map does not load shows its scenarios as missing. When openspec/checks.json does not load, no page shows coverage.</p><ul>${view.errors
        .map((error) => `<li><code>${escapeHtml(error)}</code></li>`)
        .join('')}</ul></div>`,
    );
  }
  const coverage = view.coverageTracked
    ? `<section class="total" aria-label="Test coverage of all scenarios">${coverageBar(summary.coverage, 'bar bar-large')}${legend(summary.coverage)}</section>`
    : '';
  const items = view.specs.map((spec) => {
    const scenarios = scenariosOf(spec);
    const purpose = purposeLine(spec.purpose);
    return `<li data-text="${escapeHtml(`${spec.capability} ${spec.title} ${purpose}`.toLowerCase())}">
<a class="spec-link" href="/spec/${encodeURIComponent(spec.capability)}">${escapeHtml(spec.capability)}</a>
${purpose ? `<p class="purpose-line">${inline(purpose)}</p>` : ''}
<p class="counts">${plural(spec.requirements.length, 'requirement')}, ${plural(scenarios.length, 'scenario')}</p>
${view.coverageTracked ? coverageBar(countKinds(scenarios)) : ''}
</li>`;
  });
  const body = `<h1>${escapeHtml(project)}</h1>
<p class="lede">${plural(summary.specs, 'spec')} hold ${plural(summary.requirements, 'requirement')} and ${plural(summary.scenarios, 'scenario')}.</p>
${coverage}
${notes.join('\n')}
${
  view.specs.length === 0
    ? '<p class="note">openspec/specs holds no specs yet. A spec appears here when an OpenSpec change that adds one is archived.</p>'
    : `<label class="filter" for="filter">Filter specs</label>
<input class="filter-input" id="filter" type="search" placeholder="A word from a name or a purpose" autocomplete="off">
<ul class="spec-list">
${items.join('\n')}
</ul>`
}`;
  return layout({ title: `${project} specs`, project, body });
}

/** The margin note beside a scenario: its test, or why it has none. */
function evidence(coverage) {
  if (!coverage) return '';
  const lines = [`<p class="evidence-kind">${escapeHtml(KINDS[coverage.kind].label)}</p>`];
  const entry = coverage.kind === 'conflict' ? coverage.mapped : coverage;
  if (entry.kind === 'e2e' || entry.kind === 'unit') {
    // A long path may break after a slash, not inside a name.
    const path = escapeHtml(entry.file).replace(/\//g, '/<wbr>');
    lines.push(`<p class="evidence-file"><code>${path}</code></p>`);
    if (entry.title) lines.push(`<p class="evidence-title">${escapeHtml(entry.title)}</p>`);
  } else if (entry.kind === 'none') {
    lines.push(`<p class="evidence-reason">${inline(entry.reason)}</p>`);
  }
  if (coverage.kind === 'missing') {
    lines.push('<p class="evidence-reason">The coverage check fails until the map has an entry for it.</p>');
  } else if (coverage.kind === 'invalid') {
    lines.push('<p class="evidence-reason">An entry is one test, end-to-end or unit, or a reason.</p>');
  } else if (coverage.kind === 'conflict') {
    lines.push('<p class="evidence-reason">The coverage check fails until the not-yet list drops it.</p>');
  }
  if (entry.checked) lines.push(`<p class="evidence-checked">Re-read after a change: ${inline(entry.checked)}</p>`);
  return `<aside class="evidence">${lines.join('')}</aside>`;
}

function scenario(item, id) {
  const state = item.coverage ? KINDS[item.coverage.kind].state : 'untracked';
  const steps = item.steps
    .map(
      (step) =>
        `<div class="step"><dt>${step.keyword ? escapeHtml(step.keyword) : ''}</dt><dd>${inline(step.text)}</dd></div>`,
    )
    .join('');
  return `<article class="scenario state-${state}" id="${id}">
<div class="scenario-text">
<h3><a href="#${id}">${inline(item.name, { links: false })}</a></h3>
<dl class="steps">${steps}</dl>
</div>
${evidence(item.coverage)}
</article>`;
}

export function renderSpec(view, spec) {
  const project = projectOf(view);
  // The layout's own ids come first, so no requirement or scenario takes one.
  const taken = new Set(LAYOUT_IDS);
  const ids = anchors(
    spec.requirements.map((requirement) => requirement.name),
    taken,
  );
  const scenarios = scenariosOf(spec);
  const untested = (requirement) =>
    requirement.scenarios.filter((item) => item.coverage && KINDS[item.coverage.kind].state !== 'tested').length;
  const contents = spec.requirements
    .map((requirement, at) => {
      const open = view.coverageTracked ? untested(requirement) : 0;
      return `<li><a href="#${ids[at]}"><span class="clause">§ ${at + 1}</span> ${inline(requirement.name, { links: false })}</a>${
        open > 0 ? ` <span class="toc-note">${plural(open, 'scenario')} without a test</span>` : ''
      }</li>`;
    })
    .join('');
  const sections = spec.requirements.map((requirement, at) => {
    const scenarioIds = anchors(
      requirement.scenarios.map((item) => item.name),
      taken,
      `${ids[at]}--`,
    );
    const gap =
      view.coverageTracked && requirement.shall > requirement.scenarios.length
        ? `<p class="gap-note">${plural(requirement.shall, 'SHALL sentence')} and ${plural(
            requirement.scenarios.length,
            'scenario',
          )}. The shall check asks for a scenario for each SHALL sentence.</p>`
        : '';
    return `<section class="requirement" id="${ids[at]}">
<h2><a class="clause" href="#${ids[at]}">§ ${at + 1}</a> ${inline(requirement.name)}</h2>
<div class="rule">${blocks(requirement.body)}</div>
${gap}
${requirement.scenarios.map((item, index) => scenario(item, scenarioIds[index])).join('\n')}
</section>`;
  });
  const heading = spec.title.replace(/\s+Specification$/i, '');
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">All specs</a></nav>
<h1>${inline(heading)}</h1>
<p class="source"><code>openspec/specs/${escapeHtml(spec.capability)}/spec.md</code></p>
${spec.purpose.length > 0 ? `<div class="purpose">${blocks(spec.purpose)}</div>` : ''}
<p class="lede">${plural(spec.requirements.length, 'requirement')} and ${plural(scenarios.length, 'scenario')}.</p>
${view.coverageTracked ? coverageBar(countKinds(scenarios), 'bar bar-large') : ''}
${spec.requirements.length > 1 ? `<details class="contents" open><summary>Requirements</summary><ol class="toc">${contents}</ol></details>` : ''}
${sections.join('\n')}`;
  return layout({ title: `${heading}: ${project} specs`, project, body });
}

/** The page when the specs do not load. It keeps the live script, so a fix reloads it. */
export function renderError(root, message) {
  const project = basename(root);
  const body = `<h1>The specs do not load</h1>
<p class="lede">The viewer could not read them. This page reloads when a spec or a coverage map changes.</p>
<div class="problems"><p><code>${escapeHtml(message)}</code></p></div>`;
  return layout({ title: `Not loaded: ${project} specs`, project, body });
}

export function renderNotFound(view, name) {
  const project = projectOf(view);
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">All specs</a></nav>
<h1>No spec named ${escapeHtml(name)}</h1>
<p class="lede">openspec/specs has no folder by that name. The list of all specs has the names it holds.</p>`;
  return layout({ title: `Not found: ${project} specs`, project, body });
}
