import { Node as PMNode } from 'prosemirror-model';
import { docToHtml, sanitizeHtml } from './html';

export interface HtmlDocumentOptions {
  /** The page title (`<title>`); also the PDF name when the page is printed. */
  title?: string;
  /** The `lang` attribute of the page. Default `en`. */
  lang?: string;
}

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
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
code, pre { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
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
@media print {
  @page { margin: 18mm 16mm; }
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

/**
 * A complete HTML page for a document: the content (sanitized, with
 * highlighted code) and the styles it needs, with no external resources.
 * Image sources are kept as they are, so resolve `ink-idb:` images to data
 * URLs first (see `imageStorage.inlineDocImages`) for a portable file.
 */
export function docToHtmlDocument(doc: PMNode, options: HtmlDocumentOptions = {}): string {
  const title = escapeHtml(options.title?.trim() || 'Untitled document');
  const lang = escapeHtml(options.lang || 'en');
  const body = sanitizeHtml(docToHtml(doc));
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkframe">
<title>${title}</title>
<style>${HTML_DOCUMENT_CSS}</style>
</head>
<body>
<main class="ink-document">
${body}
</main>
</body>
</html>
`;
}
