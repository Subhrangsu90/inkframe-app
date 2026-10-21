import DOMPurify from 'dompurify';
import { Plugin, PluginKey } from 'prosemirror-state';
import { DOMPURIFY_CONFIG } from '../../io/html';
import { sanitizeCssColor } from '../../schema/sanitize-css';
import { NumberStyle, defaultNumberStyle } from '../lists/list-schema';
import { MAX_INDENT } from '../paragraph-format/paragraph-format-schema';

export type PasteSource = 'word' | 'google-docs' | 'other';

/** Identifies HTML copied from Microsoft Word or Google Docs. */
export function detectPasteSource(html: string): PasteSource {
  if (/id="docs-internal-guid-/.test(html)) return 'google-docs';
  if (
    /urn:schemas-microsoft-com:office:(office|word)|content=["']?Word\.Document|class=["']?Mso|mso-[a-z-]+\s*:/i.test(
      html,
    )
  ) {
    return 'word';
  }
  return 'other';
}

// ── Colors ────────────────────────────────────────────────────────

function parseRgb(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (v === 'black') return [0, 0, 0];
  if (v === 'white') return [255, 255, 255];
  let m = /^#([0-9a-f]{3,4})$/.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m)
    return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

const isNeutral = ([r, g, b]: number[], spread: number) =>
  Math.max(r, g, b) - Math.min(r, g, b) <= spread;

/**
 * True for text colors that are only the source's default text color: black
 * or white, near-black or near-white greys (web pages copy their body color,
 * e.g. rgb(32, 33, 36)) and system keywords. Kept, they turn into dark text
 * that disappears in the dark theme (or light text in the light theme).
 */
function isDefaultTextColor(value: string): boolean {
  if (/^(windowtext|auto|inherit|initial|unset|currentcolor|black|white)$/i.test(value.trim())) {
    return true;
  }
  const rgb = parseRgb(value);
  if (!rgb || !isNeutral(rgb, 32)) return false;
  return Math.max(...rgb) <= 0x50 || Math.min(...rgb) >= 0xc8;
}

/** True for backgrounds that are a page background rather than a highlight. */
function isPageBackground(value: string): boolean {
  if (/^(transparent|none|window|auto|inherit|initial|unset|currentcolor)$/i.test(value.trim())) {
    return true;
  }
  if (/^rgba?\((?:[^,]+,){3}\s*0*(?:\.0+)?\s*\)$/i.test(value.trim())) return true; // zero alpha
  const rgb = parseRgb(value);
  if (!rgb || !isNeutral(rgb, 16)) return false;
  return Math.min(...rgb) >= 0xf0 || Math.max(...rgb) <= 0x30;
}

const NOT_A_COLOR =
  /^(none|repeat|scroll|fixed|local|center|top|bottom|left|right|auto|cover|contain|inherit|initial|unset)$/i;

/** The color in a `background` shorthand (`yellow`, `white none repeat scroll 0% 0%`), if any. */
function backgroundColorOf(shorthand: string): string | null {
  const first = shorthand.trim().split(/\s+(?![^(]*\))/)[0];
  return first && !NOT_A_COLOR.test(first) ? sanitizeCssColor(first) : null;
}

// ── DOM helpers ───────────────────────────────────────────────────

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function rename(el: Element, tag: string): HTMLElement {
  const next = el.ownerDocument.createElement(tag);
  for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
  next.append(...Array.from(el.childNodes));
  el.replaceWith(next);
  return next;
}

const styleOf = (el: Element) => el.getAttribute('style') ?? '';

/** Comments, document metadata, Office-only elements and Chrome's trailing line break. */
function removeJunk(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  // Word's `<![if !supportLists]>` markers are parsed as comments too; the
  // list marker between them is removed with the list conversion.
  comments.forEach((c) => c.parentNode?.removeChild(c));

  root
    .querySelectorAll('style, meta, link, script, title, xml, br.Apple-interchange-newline')
    .forEach((el) => el.remove());

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (!tag.includes(':')) continue;
    // <o:p> only holds paragraph-end markers; VML shapes are Word's image
    // fallbacks. Other Office elements (e.g. content controls) wrap real text.
    if (tag === 'o:p' || tag.startsWith('v:')) el.remove();
    else unwrap(el);
  }
}

// ── Microsoft Word ────────────────────────────────────────────────

const MSO_LIST = /mso-list:\s*(l\d+)\s+level(\d+)/i;
const MSO_LIST_MARKER = /mso-list:\s*ignore/i;

interface WordListItem {
  p: HTMLElement;
  /** The bullet or number Word wrote as text (`·`, `o`, `1.`, `a)`). */
  marker: Element | null;
  list: string;
  level: number;
  /** For numbered items: the number style and the item's number. */
  number: { style: NumberStyle; value: number } | null;
}

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function romanValue(text: string): number | null {
  if (!/^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(text)) return null;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const value = ROMAN_VALUES[text[i]];
    const next = ROMAN_VALUES[text[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total || null;
}

/** Reads a number marker (`3.`, `c)`, `(iv)`, `B.`) as a number style and value. */
function readNumberMarker(marker: string): WordListItem['number'] {
  const m = /^\(?(\d+|[a-z]{1,5})[.)]$/i.exec(marker);
  if (!m) return null;
  const text = m[1];
  if (/^\d+$/.test(text)) return { style: 'decimal', value: +text };
  const lower = text.toLowerCase();
  const upper = text !== lower;
  // "i" and multi-letter numerals are Roman; a single other letter is a letter.
  const roman = lower === 'i' || lower.length > 1 ? romanValue(lower) : null;
  if (roman) return { style: upper ? 'upper-roman' : 'lower-roman', value: roman };
  if (lower.length === 1) {
    return { style: upper ? 'upper-alpha' : 'lower-alpha', value: lower.charCodeAt(0) - 96 };
  }
  return { style: upper ? 'upper-alpha' : 'lower-alpha', value: 1 };
}

function wordListItem(p: HTMLElement): WordListItem | null {
  const m = MSO_LIST.exec(styleOf(p));
  if (!m) return null;
  const marker =
    Array.from(p.querySelectorAll('[style]')).find((el) => MSO_LIST_MARKER.test(styleOf(el))) ??
    null;
  const markerText = (marker?.textContent ?? '').replace(/\s+/g, ''); // \s includes &nbsp;
  return {
    p,
    marker,
    list: m[1],
    level: +m[2],
    number: readNumberMarker(markerText),
  };
}

/**
 * Sets a new Word list's start number, and its number style when it differs
 * from what the editor shows at that level anyway (1., a., i., ...).
 */
function numberWordList(list: HTMLElement, item: WordListItem, level: number): void {
  if (!item.number) return;
  if (item.number.value !== 1) list.setAttribute('start', String(item.number.value));
  if (item.number.style !== defaultNumberStyle(level)) {
    list.setAttribute('data-number-style', item.number.style);
  }
}

/** The list paragraphs that directly follow `p` and belong to the same list. */
function wordListRun(first: WordListItem): WordListItem[] {
  const run = [first];
  for (
    let next = first.p.nextElementSibling;
    next?.tagName === 'P';
    next = next.nextElementSibling
  ) {
    const item = wordListItem(next as HTMLElement);
    if (!item || item.list !== first.list) break;
    run.push(item);
  }
  return run;
}

/**
 * Word writes list items as paragraphs (`mso-list:l0 level1`) with the bullet
 * or number as text. Rebuilds them as nested <ul>/<ol> lists.
 */
function convertWordLists(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const p of Array.from(root.querySelectorAll<HTMLElement>('p'))) {
    if (!p.isConnected) continue; // already moved into a list
    const first = wordListItem(p);
    if (!first) continue;
    const run = wordListRun(first);

    let outer: HTMLElement | null = null;
    const stack: { list: HTMLElement; level: number }[] = [];
    for (const item of run) {
      while (stack.length && stack[stack.length - 1].level > item.level) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.level < item.level) {
        const list = doc.createElement(item.number ? 'ol' : 'ul');
        numberWordList(list, item, stack.length + 1);
        if (top) {
          const parentItem =
            top.list.lastElementChild ?? top.list.appendChild(doc.createElement('li'));
          parentItem.appendChild(list);
        } else {
          outer = list;
        }
        top = { list, level: item.level };
        stack.push(top);
      }
      item.marker?.remove();
      const li = doc.createElement('li');
      const para = doc.createElement('p');
      para.append(...Array.from(item.p.childNodes));
      li.appendChild(para);
      top.list.appendChild(li);
    }
    first.p.replaceWith(outer!);
    run.slice(1).forEach((item) => item.p.remove());
  }
}

/** Word's Title and Subtitle styles are paragraphs; make them headings. */
function convertWordTitles(root: HTMLElement): void {
  root.querySelectorAll('p.MsoTitle').forEach((p) => rename(p, 'h1'));
  root.querySelectorAll('p.MsoSubtitle').forEach((p) => rename(p, 'h2'));
}

// ── Google Docs ───────────────────────────────────────────────────

function cleanGoogleDocs(root: HTMLElement): void {
  // Docs wraps everything in <b style="font-weight:normal" id="docs-internal-guid-…">.
  root.querySelectorAll('b[id^="docs-internal-guid-"]').forEach(unwrap);

  // Checklist items: <li role="checkbox" aria-checked="true"> with a checkbox image.
  root.querySelectorAll('li[role="checkbox"]').forEach((li) => {
    li.setAttribute('data-type', 'task_item');
    li.setAttribute('data-checked', String(li.getAttribute('aria-checked') === 'true'));
    li.querySelectorAll('img[aria-roledescription="checkbox"]').forEach((img) => img.remove());
    li.parentElement?.setAttribute('data-type', 'task_list');
  });
}

// ── Indents (Word and Google Docs) ────────────────────────────────

const PX_PER_UNIT: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

/** Word and Google Docs indent by half an inch per Tab or Increase indent. */
const INDENT_STEP_PX = 48;

/** A CSS length in pixels (`36pt`, `.5in`, `1.27cm`), or null. */
function lengthPx(value: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|pt|in|cm|mm)$/i.exec(value.trim());
  return m ? Number(m[1]) * PX_PER_UNIT[m[2].toLowerCase()] : null;
}

/**
 * Word and Google Docs write an indented paragraph as `margin-left` in half
 * inches (36pt, .5in); that becomes the indent level the schema reads
 * (`data-indent`). Not inside list items, where the margin is the list's.
 */
function convertIndents(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6'))) {
    if (el.closest('li')) continue;
    const px = lengthPx(el.style.marginLeft || '');
    const level = px ? Math.min(MAX_INDENT, Math.round(px / INDENT_STEP_PX)) : 0;
    if (level >= 1) el.setAttribute('data-indent', String(level));
  }
}

// ── Inline styles ─────────────────────────────────────────────────

/**
 * Drops Office-only properties, default text colors and page backgrounds, and
 * rewrites `background` shorthands as `background-color` (which the highlight
 * mark reads). Inside links, colors and decorations are the link's own
 * styling, not formatting the writer chose.
 */
function cleanStyle(el: HTMLElement): void {
  const raw = el.getAttribute('style');
  if (raw === null) return;
  const inLink = !!el.closest('a');
  const isHeading = /^H[1-6]$/.test(el.tagName);
  const kept: string[] = [];
  for (const declaration of raw.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!prop || !value || prop.startsWith('mso-')) continue;
    if (prop === 'color' && (inLink || isDefaultTextColor(value))) continue;
    if (inLink && prop.startsWith('text-decoration')) continue;
    // Headings are bold already; a heading's own weight is not bold text.
    if (isHeading && prop === 'font-weight') continue;
    if (prop === 'background' || prop === 'background-color') {
      const color = prop === 'background' ? backgroundColorOf(value) : value;
      if (color && !isPageBackground(color)) kept.push(`background-color: ${color}`);
      continue;
    }
    kept.push(`${prop}: ${value}`);
  }
  if (kept.length) el.setAttribute('style', kept.join('; '));
  else el.removeAttribute('style');
}

/**
 * Cleans HTML pasted from other applications before it is parsed into the
 * document: rebuilds Word's paragraph-based lists, unwraps the Google Docs
 * wrapper, maps Google Docs checklists to task lists, keeps Word and Google
 * Docs paragraph indents as indent levels, removes Office markup
 * and the default colors that would make pasted text unreadable in the other
 * theme, then sanitizes the result with DOMPurify. Content copied from an
 * Inkframe editor (marked with `data-pm-slice`) is returned unchanged.
 */
export function cleanPastedHtml(html: string): string {
  if (typeof DOMParser === 'undefined' || /data-pm-slice/.test(html)) return html;
  const source = detectPasteSource(html);
  const body = new DOMParser().parseFromString(html, 'text/html').body;

  removeJunk(body);
  if (source === 'word') {
    convertWordLists(body);
    convertWordTitles(body);
  } else if (source === 'google-docs') {
    cleanGoogleDocs(body);
  }
  if (source !== 'other') convertIndents(body);
  body.querySelectorAll<HTMLElement>('[style]').forEach(cleanStyle);
  if (source === 'word')
    body.querySelectorAll('[class^="Mso"]').forEach((el) => el.removeAttribute('class'));
  // Line breaks between blocks are empty lines (Google Docs writes them so),
  // not a paragraph holding a hard break.
  body
    .querySelectorAll(':scope > br')
    .forEach((br) => br.replaceWith(body.ownerDocument.createElement('p')));

  return DOMPurify.sanitize(body.innerHTML, DOMPURIFY_CONFIG);
}

/** True when the clipboard HTML holds text, not just an image. */
export function htmlHasText(html: string): boolean {
  if (!html || typeof DOMParser === 'undefined') return false;
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  return !!body.textContent?.trim();
}

export const pasteCleanupKey = new PluginKey('ink-paste-cleanup');

export function pasteCleanupPlugin(): Plugin {
  return new Plugin({
    key: pasteCleanupKey,
    props: {
      transformPastedHTML: (html) => cleanPastedHtml(html),
    },
  });
}
