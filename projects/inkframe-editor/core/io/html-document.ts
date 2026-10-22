import { Fragment, Node as PMNode } from 'prosemirror-model';
import { docToHtml, sanitizeHtml } from './html';
import { withPageStarts } from './page-starts';
import {
  DOCUMENT_FONTS,
  MarginLine,
  PageSetup,
  findDocumentFont,
  findPageColor,
  pageDimensions,
  pageMarginBoxCss,
  pageMarginLines,
  pageRuleCss,
  pageSetupOf,
} from '../extensions/page-setup/page-setup';
import { sanitizeCssLength } from '../schema/sanitize-css';

export interface HtmlDocumentOptions {
  /** The page title (`<title>`); also the PDF name when the page is printed. */
  title?: string;
  /** The `lang` attribute of the page. Default `en`. */
  lang?: string;
  /**
   * `@font-face` rules to include, so the page uses the same fonts as the
   * editor (Inter, Source Serif 4 and JetBrains Mono). Leave out for a file
   * that makes no network requests; it then uses the system's fonts.
   */
  fontFaceCss?: string;
  /**
   * The document's font size in the editor (`--ink-editor-font-size`).
   * Pages layout prints at this size, so lines break as they do on screen.
   * Default `14px`.
   */
  editorFontSize?: string;
  /**
   * The document's letter spacing in the editor, when the host page sets one
   * (for example `-0.011em` on `body`). Pages layout prints with it.
   */
  editorLetterSpacing?: string;
  /**
   * Where the editor's page view starts each page after the first
   * (`getPageStarts()` of `<ink-editor>`), for the same document; null when
   * page view is off. A Pages document with page starts prints each page as
   * on screen, with its header, footer and page number; without them it
   * flows onto pages by itself, and only Chrome prints the header, footer
   * and numbers (as `@page` margin boxes).
   */
  pageStarts?: readonly number[] | null;
}

const SANS_SERIF = DOCUMENT_FONTS[0].stack;

const LETTER_SPACING = /^(normal|-?\d+(\.\d+)?(px|em|rem))$/;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Styles of a standalone document page: the editor's light theme, without
 * editing chrome. System fonts only, so the file makes no network requests.
 * The print rules keep code blocks, table rows, images and callouts whole.
 */
export const HTML_DOCUMENT_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: #f7f6f3;
  color: #1b1b1f;
  font-family: ${SANS_SERIF};
  font-size: 16px;
  line-height: 1.65;
}
.ink-document {
  max-width: 820px;
  margin: 40px auto;
  padding: 56px 64px;
  background: #ffffff;
  border: 1px solid #e8e6e1;
  overflow-wrap: break-word;
}
@media (max-width: 760px) {
  .ink-document { margin: 0; padding: 24px 20px; border: 0; }
}
.ink-document > :first-child { margin-top: 0; }
p { margin: 0; }
h1, h2, h3, h4, h5, h6 { color: #111114; font-weight: 600; line-height: 1.3; margin: 1.5rem 0 0.5rem; }
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1.05em; }
h5 { font-size: 1em; }
h6 { font-size: 0.9em; color: #6b6b73; }
a { color: #017a78; text-decoration: underline; text-underline-offset: 2px; }
ul, ol { padding-left: 1.5rem; margin: 0.75rem 0; }
li { margin: 0.25rem 0; }
li::marker { color: #6b6b73; }
ul ul, ol ul { list-style-type: circle; }
ul ul ul, ol ol ul, ol ul ul, ul ol ul { list-style-type: square; }
ol ol, ul ol { list-style-type: lower-alpha; }
ol ol ol, ul ul ol, ul ol ol, ol ul ol { list-style-type: lower-roman; }
li > :is(h1, h2, h3, h4, h5, h6):first-child { margin: 0; }
ul.ink-task-list { list-style: none; padding-left: 0.25rem; }
li.ink-task-item { position: relative; padding-left: 1.75rem; }
li.ink-task-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: calc((1.65em - 16px) / 2);
  width: 16px;
  height: 16px;
  border: 1.5px solid #9a9aa3;
  border-radius: 4px;
}
li.ink-task-item.checked::before {
  border-color: #028380;
  background: #028380 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") center / 11px no-repeat;
}
li.ink-task-item.indeterminate::before {
  border-color: #028380;
  background: linear-gradient(#028380, #028380) center / 8px 2px no-repeat;
}
li.ink-task-item.checked > :first-child { text-decoration: line-through; color: #6b6b73; }
blockquote { border-left: 3px solid #028380; margin: 1rem 0; padding: 0.45rem 1rem; color: #4b4b55; font-style: italic; }
hr { border: 0; border-top: 1px solid #e8e6e1; margin: 1.75rem 0; }
code, pre { font-family: 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { background: #f1f1f4; color: #017a78; padding: 0.15rem 0.4rem; font-size: 0.86em; border: 1px solid #ececf0; }
pre { background: #f8f8fa; color: #1b1b1f; border: 1px solid #e8e6e1; padding: 1rem 1.25rem; margin: 1rem 0; font-size: 0.88em; line-height: 1.6; overflow-x: auto; }
pre code { background: none; border: 0; padding: 0; color: inherit; font-size: inherit; }
pre.wrap { white-space: pre-wrap; }
mark { color: #1b1b1f; padding: 0.05em 0.1em; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
small { font-size: 0.8em; }
img { max-width: 100%; height: auto; vertical-align: top; }
table { border-collapse: collapse; width: 100%; margin: 1.25rem 0; }
td, th { border: 1px solid #e8e6e1; padding: 8px 12px; vertical-align: top; text-align: left; }
th { background: #f7f6f3; font-weight: 600; }
td > :first-child, th > :first-child { margin-top: 0; }
.callout { margin: 1rem 0; padding: 0.75rem 1rem; border-left: 3px solid #028380; background: #e0f8f6; }
.callout-body > :first-child { margin-top: 0; }
.callout-body > :last-child { margin-bottom: 0; }
.callout-info { border-left-color: #3b82f6; background: #eff6ff; color: #1e40af; }
.callout-note { border-left-color: #a855f7; background: #faf5ff; color: #6b21a8; }
.callout-warning { border-left-color: #f59e0b; background: #fffbeb; color: #92400e; }
.callout-success { border-left-color: #10b981; background: #f0fdf4; color: #166534; }
.callout-danger { border-left-color: #ef4444; background: #fef2f2; color: #991b1b; }
.token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6e7781; font-style: italic; }
.token.punctuation { color: #57606a; }
.token.property, .token.tag, .token.constant, .token.symbol, .token.deleted { color: #cf222e; }
.token.boolean, .token.number { color: #0550ae; }
.token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #0a3069; }
.token.operator, .token.entity, .token.url { color: #0550ae; }
.token.atrule, .token.attr-value, .token.keyword { color: #8250df; }
.token.function, .token.class-name { color: #6639ba; }
.token.regex, .token.important, .token.variable { color: #953800; }
.ink-page-break { height: 0; margin: 2rem 0; border-top: 1px dashed #c9c7c1; }
@media print {
  @page { margin: 18mm 16mm; }
  .ink-page-break { break-after: page; margin: 0; border: 0; }
  body { background: #ffffff; font-size: 11pt; }
  .ink-document { max-width: none; margin: 0; padding: 0; border: 0; }
  a { color: inherit; }
  pre { white-space: pre-wrap; overflow: visible; }
  pre, blockquote, .callout, tr, img, li.ink-task-item { break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
  thead { display: table-header-group; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Keeps text placed inside a `<style>` element from closing it. */
const styleText = (css: string) => css.replace(/<\/style/gi, '<\\/style');

const mm = (value: number) => `${+value.toFixed(2)}mm`;

/** The header and footer text's size: 0.8 × the document's (in pixels when known). */
function marginTextSize(fontSize: string): string {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(fontSize);
  return px ? `${+(Number(px[1]) * 0.8).toFixed(2)}px` : '0.8em';
}

/**
 * Print rules for the document's page setup. Pages layout prints on its
 * paper size and margins, with the text set as the editor sets it, so lines
 * break where they do on screen: the editor's font size and letter spacing,
 * no ligatures, and spaces at the end of a line taking up room (the editor's
 * `white-space: break-spaces`). Pageless keeps the defaults above.
 *
 * Printed as page boxes (`paged`), each box is the paper and draws its own
 * margins, so the `@page` margins are 0. Otherwise the printout flows onto
 * pages with the document's margins, and the header, footer and numbers go
 * in `@page` margin boxes (which only Chrome prints).
 */
function pageSetupCss(
  setup: PageSetup,
  fontSize: string,
  letterSpacing: string,
  paged: boolean,
): string {
  if (setup.layout !== 'pages') return '';
  const { width, height } = pageDimensions(setup);
  const page = paged
    ? `@page { size: ${mm(width)} ${mm(height)}; margin: 0; }`
    : pageRuleCss(setup) +
      '\n' +
      pageMarginBoxCss(setup, `${marginTextSize(fontSize)} ${findDocumentFont(setup.font).stack}`);
  return `@media print {
  ${page}
  body { font-size: ${fontSize}; letter-spacing: ${letterSpacing}; }
  .ink-document { font-variant-ligatures: none; font-feature-settings: 'liga' 0; }
  .ink-document :is(p, h1, h2, h3, h4, h5, h6) { white-space: break-spaces; }
}
`;
}

/**
 * Page boxes: each printed page drawn by the page itself, the size of the
 * paper, with the margins as padding and the header and footer in them.
 * A box is 2px shorter than the paper, so rounding never pushes it onto a
 * second sheet; content taller than a page grows it onto one rather than
 * being cut off. On screen they show as sheets.
 */
function pageBoxCss(setup: PageSetup, fontSize: string): string {
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;
  return `.ink-document.ink-paged { max-width: none; margin: 0; padding: 0; border: 0; background: none; }
.ink-print-page {
  position: relative;
  width: ${mm(width)};
  min-height: calc(${mm(height)} - 2px);
  margin: 24px auto;
  padding: ${mm(top)} ${mm(right)} ${mm(bottom)} ${mm(left)};
  background: #ffffff;
  border: 1px solid #e8e6e1;
}
.ink-print-body > :first-child { margin-top: 0; }
.ink-page-band {
  position: absolute;
  left: ${mm(left)};
  right: ${mm(right)};
  display: flex;
  align-items: center;
  gap: 1em;
  font-size: ${marginTextSize(fontSize)};
  line-height: 1.3;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  color: #6b6b6b;
}
.ink-page-band-top { top: 0; height: ${mm(top)}; }
.ink-page-band-bottom { bottom: 0; height: ${mm(bottom)}; }
.ink-page-slot { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ink-page-slot.is-empty { flex: 0 0 0; }
.ink-page-band-balanced > .ink-page-slot.is-empty { flex: 1 1 0; }
.ink-page-slot-center { text-align: center; }
.ink-page-slot-right { text-align: right; }
@media print {
  .ink-print-page { margin: 0; border: 0; break-after: page; }
  .ink-print-page:last-child { break-after: auto; }
}
`;
}

/**
 * The page color (its light value): the sheet's background on screen. In
 * print only when the document asks for it (`printColor`), then across the
 * whole sheet, margins included: an `@page` background, and `html` for
 * browsers that paint only inside the margins (page boxes paint it
 * themselves). Otherwise paper stays white.
 */
function pageColorCss(setup: PageSetup): string {
  const color = findPageColor(setup.color)?.light;
  if (!color) return '';
  const print = setup.printColor
    ? `@page { background: ${color}; }\n  html, body, .ink-print-page { background: ${color}; }\n  `
    : '.ink-print-page { background: #ffffff; }\n  ';
  return `.ink-document, .ink-print-page { background: ${color}; }
@media print {
  ${print}.ink-document { background: transparent; }
}
`;
}

/** The document's font, when it is not Sans: the text, headers and footers (code stays mono). */
function documentFontCss(setup: PageSetup): string {
  return setup.font === 'sans'
    ? ''
    : `body { font-family: ${findDocumentFont(setup.font).stack}; }\n`;
}

/** A header or footer as HTML: its left, center and right text (escaped). */
function marginLineHtml(edge: 'top' | 'bottom', line: MarginLine | null): string {
  if (!line) return '';
  const balanced = !!line.center && (!!line.left || !!line.right) ? ' ink-page-band-balanced' : '';
  const slots = (['left', 'center', 'right'] as const)
    .map(
      (align) =>
        `<span class="ink-page-slot ink-page-slot-${align}${line[align] ? '' : ' is-empty'}">${escapeHtml(line[align])}</span>`,
    )
    .join('');
  return `<div class="ink-page-band ink-page-band-${edge}${balanced}" aria-hidden="true">${slots}</div>`;
}

/**
 * The document as page boxes: split where its pages start (`withPageStarts`)
 * and at its own page breaks, each page in a box with its header, footer and
 * number.
 */
function pageBoxesHtml(doc: PMNode, setup: PageSetup, starts: readonly number[]): string {
  const split = withPageStarts(doc, starts);
  const pages: PMNode[][] = [[]];
  split.forEach((node) => {
    if (node.type.name === 'page_break') pages.push([]);
    else pages[pages.length - 1].push(node);
  });
  // A page break at the very end starts no page (as on screen).
  if (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
  return pages
    .map((nodes, i) => {
      const html = sanitizeHtml(docToHtml(split.type.create(split.attrs, Fragment.from(nodes))));
      const lines = pageMarginLines(setup, i + 1, pages.length);
      return `<section class="ink-print-page">${marginLineHtml('top', lines.top)}<div class="ink-print-body">${html}</div>${marginLineHtml('bottom', lines.bottom)}</section>`;
    })
    .join('\n');
}

/**
 * A complete HTML page for a document: the content (sanitized, with
 * highlighted code) and the styles it needs, with no external resources.
 * Image sources are kept as they are, so resolve `ink-idb:` images to data
 * URLs first (see `imageStorage.inlineDocImages`) for a portable file.
 */
export function docToHtmlDocument(doc: PMNode, options: HtmlDocumentOptions = {}): string {
  const title = escapeHtml(options.title?.trim() || 'Untitled document');
  const lang = escapeHtml(options.lang || 'en');
  const fontSize = sanitizeCssLength(options.editorFontSize) ?? '14px';
  const spacing = options.editorLetterSpacing?.trim() ?? '';
  const letterSpacing = LETTER_SPACING.test(spacing) ? spacing : 'normal';
  const setup = pageSetupOf(doc);
  const starts = options.pageStarts;
  const paged = setup.layout === 'pages' && !!starts;
  const body = paged ? pageBoxesHtml(doc, setup, starts) : sanitizeHtml(docToHtml(doc));
  const css =
    (options.fontFaceCss ?? '') +
    HTML_DOCUMENT_CSS +
    documentFontCss(setup) +
    pageSetupCss(setup, fontSize, letterSpacing, paged) +
    (paged ? pageBoxCss(setup, fontSize) : '') +
    pageColorCss(setup);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkframe">
<title>${title}</title>
<style>${styleText(css)}</style>
</head>
<body>
<main class="ink-document${paged ? ' ink-paged' : ''}">
${body}
</main>
</body>
</html>
`;
}
