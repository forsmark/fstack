import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blocks, escapeHtml, inline } from '../lib/view/markdown.mjs';
import { renderError, renderIndex, renderNotFound, renderSpec, slug } from '../lib/view/render.mjs';
import { specView } from '../lib/view/model.mjs';

describe('inline', () => {
  it('escapes markup in the source before it adds its own', () => {
    assert.equal(inline('<script>alert(1)</script> & "x"'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('renders code, bold, italic and links, and leaves the text inside code alone', () => {
    assert.equal(
      inline('`a*b*c` **bold** *it* _em_ [doc](https://x.y/?a=1&b=2)'),
      '<code>a*b*c</code> <strong>bold</strong> <em>it</em> <em>em</em> <a href="https://x.y/?a=1&amp;b=2">doc</a>',
    );
  });

  it('keeps a link with a script URL as text', () => {
    assert.equal(inline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
    assert.equal(inline('[x](data:text/html,hi)'), '[x](data:text/html,hi)');
  });

  it('leaves the underscores of a snake_case name', () => {
    assert.equal(inline('snake_case_name'), 'snake_case_name');
  });

  it('marks SHALL, SHALL NOT, MUST and MAY, and not a keyword inside code', () => {
    assert.equal(
      inline('It SHALL NOT fail and MAY retry. `SHALL`'),
      'It <span class="keyword">SHALL NOT</span> fail and <span class="keyword">MAY</span> retry. <code>SHALL</code>',
    );
  });

  it('keeps code inside a link label, and keeps a target with code in it as text', () => {
    assert.equal(inline('[`a`](https://x)'), '<a href="https://x"><code>a</code></a>');
    assert.equal(inline('[x](a`b`)'), '[x](a<code>b</code>)');
  });

  it('drops a NUL from the source, so the source cannot name a kept piece', () => {
    assert.equal(inline('a\u00000\u0000 `b`'), 'a0 <code>b</code>');
  });

  it('shows a link as its label alone when links are off', () => {
    assert.equal(inline('Follows [the `guide`](docs/guide.md)', { links: false }), 'Follows the <code>guide</code>');
  });
});

describe('blocks', () => {
  it('renders paragraphs, nested lists, tables, quotes, fenced code and headings', () => {
    const html = blocks([
      'One', 'line', '',
      '- a', '  - b', '    wrapped', '- c', '',
      '| A | B |', '|---|---|', '| x | **y** |', '',
      '> quote', '',
      '```', '<b>', '```',
      '#### Note',
    ]);
    assert.equal(
      html,
      [
        '<p>One line</p>',
        '<ul><li>a<ul><li>b wrapped</li></ul></li><li>c</li></ul>',
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td><strong>y</strong></td></tr></tbody></table>',
        '<blockquote><p>quote</p></blockquote>',
        '<pre><code>&lt;b&gt;</code></pre>',
        '<h6>Note</h6>',
      ].join('\n'),
    );
  });

  it('starts a table directly under a line of prose', () => {
    assert.equal(
      blocks(['The page SHALL show:', '| a | b |', '|---|---|', '| 1 | 2 |']),
      '<p>The page <span class="keyword">SHALL</span> show:</p>\n' +
        '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
  });

  it('starts a new list where the kind of list changes at the same indent', () => {
    assert.equal(blocks(['- a', '1. b', '2. c']), '<ul><li>a</li></ul><ol><li>b</li><li>c</li></ol>');
    assert.equal(blocks(['- a', '  1. b', '- c']), '<ul><li>a<ol><li>b</li></ol></li><li>c</li></ul>');
  });

  it('drops a NUL from fenced code, as from every other text', () => {
    assert.equal(blocks(['```', 'a\u0000b', '```']), '<pre><code>ab</code></pre>');
    assert.equal(escapeHtml('a\u0000<'), 'a&lt;');
  });

  it('escapes the source of every block', () => {
    assert.doesNotMatch(blocks(['<img src=x onerror=alert(1)>', '- <b>', '| <i> | x |', '|---|---|']), /<(img|b|i)\b/);
  });
});

describe('slug', () => {
  it('turns a name into an anchor', () => {
    assert.equal(slug('A loan is a span, of days!'), 'a-loan-is-a-span-of-days');
    assert.equal(slug('???'), 'section');
    assert.equal(slug('Mødested før åbning'), 'mødested-før-åbning');
  });
});

const SPEC = `# Sign-in Specification

## Purpose

How a member signs in.

## Requirements

### Requirement: Sign-in link

The system SHALL mail a link. The link SHALL work once.

#### Scenario: Known <address>
- **WHEN** a member asks for a link
- **THEN** the system mails a link

#### Scenario: Unknown address
- **WHEN** a stranger asks
- **THEN** the system mails nothing

### Requirement: Sign-in link

A second requirement with the same name.
`;

function viewOf(spec, tracked) {
  return { root: '/work/demo', coverageTracked: tracked, specs: [spec], summary: { specs: 1, requirements: 2, scenarios: 2, coverage: {} }, errors: [] };
}

describe('renderSpec', () => {
  const map = { 'Sign-in link': { 'Known <address>': { e2e: 'e2e/tests/sign-in.spec.ts › mails a link' } } };
  const spec = specView('sign-in', SPEC, map, new Set());
  const html = renderSpec(viewOf(spec, true), spec);

  it('shows each scenario with its steps and its evidence', () => {
    assert.match(html, /<h1>Sign-in<\/h1>/);
    assert.match(html, /Known &lt;address&gt;/);
    assert.match(html, /<dt>WHEN<\/dt><dd>a member asks for a link<\/dd>/);
    assert.match(html, /End-to-end test/);
    assert.match(html, /e2e\/<wbr>tests\/<wbr>sign-in\.spec\.ts/);
    assert.match(html, /Missing from the coverage map/);
  });

  it('gives two requirements with one name two different anchors', () => {
    assert.match(html, /<section class="requirement" id="sign-in-link"/);
    assert.match(html, /<section class="requirement" id="sign-in-link-2"/);
  });

  it('gives every element on the page its own id, whatever the names', () => {
    const names = ['A', 'A', 'A 2', 'Foo', 'Foo title', '???', '!!!', 'Live', 'Filter'];
    const text = names.map((name) => `### Requirement: ${name}\nText.\n\n#### Scenario: ${name}\n- **THEN** it holds\n`).join('\n');
    const odd = specView('odd', text, {}, new Set());
    const ids = [...renderSpec(viewOf(odd, true), odd).matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, names.length * 2 + 1);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('puts no link inside the link of a scenario heading or a contents entry', () => {
    const linked = specView(
      'linked',
      '### Requirement: Uses [the guide](docs/guide.md)\nText.\n\n#### Scenario: Follows [the guide](docs/guide.md)\n- **THEN** it holds\n\n### Requirement: Other\nText.\n',
    );
    const page = renderSpec(viewOf(linked, false), linked);
    assert.doesNotMatch(page, /<a [^>]*>[^<]*(<(?!\/a>)[^>]*>[^<]*)*<a /);
    assert.match(page, /<h3><a href="#[^"]+">Follows the guide<\/a><\/h3>/);
  });

  it('shows a scenario that is mapped and still on the not-yet list as a gap, with its test', () => {
    const both = specView('sign-in', SPEC, map, new Set(['sign-in › Sign-in link › Known <address>']));
    const page = renderSpec(viewOf(both, true), both);
    assert.match(page, /class="scenario state-gap" id="sign-in-link--known-address"/);
    assert.match(page, /Mapped, and still on the not-yet list/);
    assert.match(page, /e2e\/<wbr>tests\/<wbr>sign-in\.spec\.ts/);
    assert.match(page, /fails until the not-yet list drops it/);
  });

  it('says when a requirement has more SHALL sentences than scenarios, only where the project uses the checks', () => {
    const fewer = specView('sign-in', SPEC.replace(/#### Scenario: Unknown address[\s\S]*?(?=### )/, ''), {}, new Set());
    assert.match(renderSpec(viewOf(fewer, true), fewer), /2 SHALL sentences and 1 scenario\./);
    const untracked = specView('sign-in', SPEC.replace(/#### Scenario: Unknown address[\s\S]*?(?=### )/, ''));
    assert.doesNotMatch(renderSpec(viewOf(untracked, false), untracked), /SHALL sentences/);
  });

  it('shows no evidence and no bar where the project tracks no coverage', () => {
    const plain = specView('sign-in', SPEC);
    const page = renderSpec(viewOf(plain, false), plain);
    assert.doesNotMatch(page, /class="evidence"/);
    assert.doesNotMatch(page, /<svg/);
    assert.match(page, /class="scenario state-untracked"/);
  });
});

describe('renderIndex', () => {
  it('lists each spec with its counts, and names the files that do not load', () => {
    const spec = specView('sign-in', SPEC, {}, new Set());
    const view = { ...viewOf(spec, true), summary: { specs: 1, requirements: 2, scenarios: 2, coverage: { missing: 2 } }, errors: ['e2e/coverage/sign-in.json: <bad>'] };
    const html = renderIndex(view);
    assert.match(html, /<h1>demo<\/h1>/);
    assert.match(html, /href="\/spec\/sign-in"/);
    assert.match(html, /2 requirements, 2 scenarios/);
    assert.match(html, /<code>e2e\/coverage\/sign-in\.json: &lt;bad&gt;<\/code>/);
    assert.match(html, /Missing from the coverage map <span class="count">2<\/span>/);
  });

  it('names a config that does not load, and does not call it missing', () => {
    const html = renderIndex({
      root: '/work/demo',
      coverageTracked: false,
      configFound: true,
      specs: [],
      summary: { specs: 0, requirements: 0, scenarios: 0, coverage: {} },
      errors: ['openspec/checks.json: Unexpected token'],
    });
    assert.doesNotMatch(html, /has no openspec\/checks\.json/);
    assert.match(html, /<code>openspec\/checks\.json: Unexpected token<\/code>/);
  });

  it('says where the project has no specs or no checks', () => {
    const html = renderIndex({ root: '/work/demo', coverageTracked: false, specs: [], summary: { specs: 0, requirements: 0, scenarios: 0, coverage: {} }, errors: [] });
    assert.match(html, /holds no specs yet/);
    assert.match(html, /no openspec\/checks\.json/);
  });
});

describe('renderError', () => {
  it('shows the error in a page that keeps the live script', () => {
    const html = renderError('/work/demo', 'EISDIR: <x>');
    assert.match(html, /<script src="\/live\.js" defer><\/script>/);
    assert.match(html, /EISDIR: &lt;x&gt;/);
  });
});

describe('renderNotFound', () => {
  it('escapes the name it was asked for', () => {
    const html = renderNotFound({ root: '/work/demo' }, '<x>');
    assert.match(html, /No spec named &lt;x&gt;/);
    assert.equal(escapeHtml("'"), '&#39;');
  });
});
