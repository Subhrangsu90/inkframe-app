import {
  DocJSON,
  SCHEMA_VERSION,
  StoredDoc,
  htmlToDoc,
  imageStorage,
  markdownToDoc,
} from '@inkframe-ui/editor/core';
import { dataUrlToBlob } from './data-url';

export { IMPORT_ACCEPT } from './file-types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** A file that cannot be imported. The message is written for people. */
export class ImportError extends Error {
  override readonly name = 'ImportError';
}

export type ImportFormat = 'markdown' | 'html';

const extensionOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** The format of a file, or null when it is not Markdown, HTML or plain text. */
export function importFormat(file: Pick<File, 'name' | 'type'>): ImportFormat | null {
  const ext = extensionOf(file.name);
  if (ext === 'html' || ext === 'htm' || file.type === 'text/html') return 'html';
  if (['md', 'markdown', 'mdown', 'mkd', 'txt'].includes(ext)) return 'markdown';
  if (file.type === 'text/markdown' || file.type === 'text/plain') return 'markdown';
  return null;
}

const fileStem = (name: string) => name.replace(/\.[^.]+$/, '').trim();

function firstHeading(stored: StoredDoc): string {
  const blocks = (stored.doc as DocJSON).content ?? [];
  const heading = blocks.find((node) => node.type === 'heading');
  return (heading?.content ?? [])
    .map((child) => child.text ?? '')
    .join('')
    .trim();
}

/**
 * Moves images embedded as `data:` URLs into image storage, so the document
 * (and each of its versions) stores a short reference instead of the image.
 * Images that cannot be stored stay embedded.
 */
export async function storeEmbeddedImages(stored: StoredDoc): Promise<StoredDoc> {
  const visit = async (node: DocJSON) => {
    const src = node.attrs?.['src'];
    if (node.type === 'image' && typeof src === 'string' && src.startsWith('data:image/')) {
      const blob = dataUrlToBlob(src);
      if (blob) {
        try {
          const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : undefined;
          node.attrs!['src'] = (await imageStorage.saveImage(blob, alt || 'image')).uri;
        } catch {
          // Storage refused the image: keep it embedded.
        }
      }
    }
    for (const child of node.content ?? []) await visit(child);
  };
  await visit(stored.doc as DocJSON);
  return stored;
}

/**
 * Reads a Markdown or HTML file into a document. The title is the first
 * heading, else the HTML page title, else the file name.
 */
export async function readImportFile(file: File): Promise<{ title: string; doc: StoredDoc }> {
  const format = importFormat(file);
  if (!format) {
    throw new ImportError(`"${file.name}" is not a Markdown or HTML file.`);
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError(`"${file.name}" is larger than 10 MB.`);
  }
  const text = await file.text();
  const node = format === 'html' ? htmlToDoc(text) : markdownToDoc(text);
  const doc = await storeEmbeddedImages({ schemaVersion: SCHEMA_VERSION, doc: node.toJSON() });
  const pageTitle =
    format === 'html' ? new DOMParser().parseFromString(text, 'text/html').title.trim() : '';
  const title = firstHeading(doc) || pageTitle || fileStem(file.name) || 'Imported document';
  return { title, doc };
}
