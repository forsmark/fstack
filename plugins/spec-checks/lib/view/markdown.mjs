/**
 * The little markdown a spec holds, as HTML: paragraphs, lists, fenced code,
 * tables, quotes and headings, with code, bold, italic and links inside a line.
 * Every character of the source is escaped first, so a spec cannot add markup.
 * SHALL, MUST, SHOULD and MAY are marked, so the page can set them apart.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text as HTML. A NUL goes, so no source text can look like a placeholder of `inline`. */
export const escapeHtml = (text) =>
  String(text)
    .replace(/\u0000/g, '')
    .replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** A link target the page may follow: http, https, mailto, an anchor, or a relative path. */
const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|\.{1,2}\/|[\w-]+(\/|\.|#|$))/i;

const KEYWORD = /\b(SHALL NOT|SHALL|MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)\b/g;

const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/**
 * One line of markdown as HTML. With `links: false`, a link shows as its label
 * only, for text that sits inside a link of the page's own.
 */
export function inline(text, { links = true } = {}) {
  const kept = [];
  const keep = (html) => `\u0000${kept.push(html) - 1}\u0000`;
  let html = escapeHtml(text)
    .replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
      if (!links) return keep(label);
      // A target with code in it, or an unsafe one, stays text.
      if (url.includes('\u0000') || !SAFE_URL.test(url.replace(/&amp;/g, '&'))) return match;
      return keep(`<a href="${url}">${label}</a>`);
    });
  html = html
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(KEYWORD, (word) => `<span class="keyword">${word}</span>`);
  // Text kept aside comes back last, so no rule above reads inside code or a link
  // target. A kept link may hold kept code, and each entry holds only earlier ones.
  while (html.includes('\u0000')) html = html.replace(PLACEHOLDER, (_, at) => kept[Number(at)]);
  return html;
}

const FENCE = /^\s*```/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (row) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => inline(cell.trim()));

/** A run of list items as nested lists, by indent. A change of list kind starts a new list. */
function list(items) {
  let html = '';
  const open = [];
  for (const { indent, ordered, text } of items) {
    const tag = ordered ? 'ol' : 'ul';
    while (open.length > 0 && indent < open.at(-1).indent) html += `</li></${open.pop().tag}>`;
    if (open.length > 0 && indent === open.at(-1).indent && tag !== open.at(-1).tag) {
      html += `</li></${open.pop().tag}>`;
    }
    if (open.length === 0 || indent > open.at(-1).indent) {
      open.push({ indent, tag });
      html += `<${tag}><li>`;
    } else html += '</li><li>';
    html += inline(text);
  }
  while (open.length > 0) html += `</li></${open.pop().tag}>`;
  return html;
}

/** Some lines of markdown as HTML blocks. A heading drops two levels, to sit under the page's own. */
export function blocks(lines) {
  const out = [];
  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (line.trim() === '') {
      at += 1;
    } else if (FENCE.test(line)) {
      const code = [];
      at += 1;
      while (at < lines.length && !FENCE.test(lines[at])) code.push(lines[at++]);
      at += 1;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (HEADING.test(line)) {
      const [, marks, text] = HEADING.exec(line);
      const level = Math.min(6, marks.length + 2);
      out.push(`<h${level}>${inline(text)}</h${level}>`);
      at += 1;
    } else if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[at + 1] ?? '')) {
      const head = cells(line);
      at += 2;
      const rows = [];
      while (at < lines.length && TABLE_ROW.test(lines[at])) rows.push(cells(lines[at++]));
      out.push(
        `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
    } else if (LIST_ITEM.test(line)) {
      const items = [];
      while (at < lines.length) {
        const item = LIST_ITEM.exec(lines[at]);
        if (item) {
          items.push({ indent: item[1].length, ordered: /\d/.test(item[2]), text: item[3] });
        } else if (lines[at].trim() !== '' && /^\s+/.test(lines[at]) && items.length > 0) {
          items.at(-1).text += ` ${lines[at].trim()}`;
        } else break;
        at += 1;
      }
      out.push(list(items));
    } else if (/^\s*>/.test(line)) {
      const quote = [];
      while (at < lines.length && /^\s*>/.test(lines[at])) quote.push(lines[at++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${blocks(quote)}</blockquote>`);
    } else {
      const paragraph = [];
      while (
        at < lines.length &&
        lines[at].trim() !== '' &&
        !FENCE.test(lines[at]) &&
        !HEADING.test(lines[at]) &&
        !LIST_ITEM.test(lines[at]) &&
        !/^\s*>/.test(lines[at]) &&
        !(TABLE_ROW.test(lines[at]) && TABLE_RULE.test(lines[at + 1] ?? ''))
      ) {
        paragraph.push(lines[at++].trim());
      }
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}
