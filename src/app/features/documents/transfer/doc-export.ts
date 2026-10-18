import {
  HtmlDocumentOptions,
  StoredDoc,
  docToHtmlDocument,
  docToMarkdown,
  imageStorage,
  migrate,
  schema,
} from '@inkframe-ui/editor/core';
import { downloadFile, safeFileName } from './data-url';

const toNode = (stored: StoredDoc) => schema.nodeFromJSON(migrate(stored));

export function docToMarkdownText(stored: StoredDoc): string {
  return docToMarkdown(toNode(stored));
}

/**
 * A standalone HTML page of the document with its images embedded, so the
 * file works anywhere and makes no network requests (except for images the
 * document links from the web).
 */
export async function buildHtmlPage(
  stored: StoredDoc,
  title: string,
  options: HtmlDocumentOptions = {},
): Promise<string> {
  const inlined = await imageStorage.inlineDocImages(stored);
  return docToHtmlDocument(toNode(inlined), { ...options, title });
}

/** Downloads the document as Markdown. Returns the file name. */
export function downloadMarkdown(stored: StoredDoc, title: string): string {
  const filename = safeFileName(title, 'md');
  const markdown = docToMarkdownText(stored) || `# ${title}`;
  downloadFile(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filename);
  return filename;
}

/** Downloads the document as a standalone HTML page. Returns the file name. */
export async function downloadHtml(stored: StoredDoc, title: string): Promise<string> {
  const filename = safeFileName(title, 'html');
  const html = await buildHtmlPage(stored, title);
  downloadFile(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
  return filename;
}

let printFrame: HTMLIFrameElement | null = null;

const EDITOR_FONTS = /Inter Variable|JetBrains Mono Variable/;

// By its text rather than `instanceof CSSFontFaceRule`, which not every DOM implements.
const isFontFace = (rule: CSSRule): rule is CSSFontFaceRule =>
  rule.cssText.startsWith('@font-face');

/**
 * The app's `@font-face` rules for the editor's fonts, with absolute URLs, so
 * a printout uses the same fonts as the screen. The print frame has the
 * app's origin, so the service worker serves the files offline too.
 */
export function editorFontFaceCss(doc: Document = document): string {
  const rules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // another origin's stylesheet
    }
    const base = sheet.href ?? doc.baseURI;
    for (const rule of Array.from(cssRules)) {
      if (!isFontFace(rule)) continue;
      if (!EDITOR_FONTS.test(rule.style.getPropertyValue('font-family'))) continue;
      rules.push(absoluteCssUrls(rule.cssText, base));
    }
  }
  return rules.join('\n');
}

/** The CSS with every `url(…)` resolved against `base`, the stylesheet's address. */
export function absoluteCssUrls(css: string, base: string): string {
  return css.replace(
    /url\((["']?)([^"')]+)\1\)/g,
    (_match, _quote, url: string) => `url("${new URL(url.trim(), base).href}")`,
  );
}

/** Loads the fonts the document's text needs, waiting up to `timeoutMs`. */
async function loadFonts(doc: Document, timeoutMs = 3000): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts) return;
  const text = doc.body.textContent || ' ';
  const loaded = Promise.all([
    fonts.load('16px "Inter Variable"', text),
    fonts.load('16px "JetBrains Mono Variable"', text),
  ]).then(
    () => fonts.ready,
    () => undefined,
  );
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Loads every image in a document now, waiting up to `timeoutMs` for all of them. */
async function loadAllImages(doc: Document, timeoutMs = 5000): Promise<void> {
  const images = Array.from(doc.images);
  for (const img of images) img.loading = 'eager';
  // decode() settles once the image has loaded; a broken image must not block printing.
  const loaded = Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Opens the print dialog for the document, laid out by the HTML page's print
 * styles (no app interface). "Save as PDF" in that dialog makes the PDF.
 * The page title is the document's while the dialog is open, which browsers
 * use to name the PDF.
 */
export async function printDocument(stored: StoredDoc, title: string): Promise<void> {
  const editorFontSize = getComputedStyle(document.documentElement)
    .getPropertyValue('--ink-editor-font-size')
    .trim();
  const html = await buildHtmlPage(stored, title, {
    fontFaceCss: editorFontFaceCss(),
    editorFontSize: editorFontSize || undefined,
  });
  printFrame?.remove();

  const frame = document.createElement('iframe');
  printFrame = frame;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Not display: none, which some browsers refuse to print.
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });

  const win = frame.contentWindow;
  if (!win) return;
  // Images load lazily, and the frame is 0×0 so none is ever near the screen:
  // load them all before printing, or the printout has blank images. The
  // same goes for fonts, or the printout uses the fallback fonts.
  await Promise.all([loadAllImages(win.document), loadFonts(win.document)]);
  const pageTitle = document.title;
  const cleanup = () => {
    document.title = pageTitle;
    if (printFrame === frame) {
      frame.remove();
      printFrame = null;
    }
  };
  // Chrome blocks in print() until the dialog closes; Safari and Firefox
  // return at once and send afterprint later.
  win.addEventListener('afterprint', () => setTimeout(cleanup), { once: true });
  document.title = title;
  win.focus();
  win.print();
}
