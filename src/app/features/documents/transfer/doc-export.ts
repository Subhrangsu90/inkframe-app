import {
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
export async function buildHtmlPage(stored: StoredDoc, title: string): Promise<string> {
  const inlined = await imageStorage.inlineDocImages(stored);
  return docToHtmlDocument(toNode(inlined), { title });
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
  const html = await buildHtmlPage(stored, title);
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
  // load them all before printing, or the printout has blank images.
  await loadAllImages(win.document);
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
