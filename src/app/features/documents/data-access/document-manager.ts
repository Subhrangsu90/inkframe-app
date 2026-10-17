import { Injectable } from '@angular/core';
import {
  DocJSON,
  SCHEMA_VERSION,
  StoredDoc,
  countWords,
  imageStorage,
} from '@inkframe-ui/editor/core';
import { WELCOME_DOC } from './welcome-doc';
import { deleteVersions, VERSION_KEY_PREFIX } from '../versions/version-store';

export type { StoredDoc };

export interface DocMeta {
  id: string;
  title: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  /** Plain-text preview of the body. Missing on entries saved before previews existed. */
  excerpt?: string;
  /** The EXCERPT_VERSION the preview was made with. Missing on older entries. */
  excerptVersion?: number;
}

/**
 * Raised when extractDocExcerpt changes what it produces, so previews saved
 * by an older version are rebuilt (see backfillExcerpts).
 */
export const EXCERPT_VERSION = 2;

const INDEX_KEY = 'inkframe_docs_index';
const ACTIVE_ID_KEY = 'inkframe_active_doc_id';
const LEGACY_SAVED_KEY = 'inkframe_saved_doc';

const docKey = (id: string) => `inkframe_doc_${id}`;

/** A node's children; documents from share links may be malformed, so check. */
const childrenOf = (node: DocJSON | undefined): DocJSON[] =>
  node && Array.isArray(node.content) ? node.content : [];

const inlineText = (node: DocJSON) =>
  childrenOf(node)
    .map((c) => c.text || '')
    .join('')
    .trim();

export function extractDocTitle(stored: StoredDoc): string {
  try {
    const blocks = childrenOf(stored?.doc as DocJSON | undefined);
    for (const node of blocks) {
      if (node.type === 'heading') {
        const text = inlineText(node);
        if (text) return text;
      }
    }
    for (const node of blocks) {
      if (node.type === 'paragraph') {
        const text = inlineText(node);
        if (text) {
          return text.length > 40 ? text.slice(0, 40) + '...' : text;
        }
      }
    }
  } catch {
    // Malformed document: use the default title.
  }
  return 'Untitled Document';
}

function plainText(node: DocJSON | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hard_break') return ' ';
  const children = childrenOf(node);
  // Text runs inside one paragraph join directly; separate blocks get a space.
  const inline = children.every((c) => typeof c.text === 'string' || c.type === 'hard_break');
  return children.map(plainText).join(inline ? '' : ' ');
}

/**
 * The text of each paragraph-like block inside a node (list items, quotes,
 * table cells and code blocks included), in document order.
 */
function textBlocks(node: DocJSON): string[] {
  const children = childrenOf(node);
  // A block whose children carry no content of their own holds only inline text.
  if (children.every((c) => !Array.isArray(c.content))) return [plainText(node)];
  return children.flatMap(textBlocks);
}

/**
 * A short plain-text preview of a document for lists and cards.
 *
 * Section headings are left out, since on one line they run into the text
 * around them ("Overview This design doc…"). A leading heading stays when it
 * is not the title, because it often says what the document is about.
 * Headings are used only when the document has no other text. Blocks are
 * separated by " · " unless the previous one ends a sentence.
 */
export function extractDocExcerpt(stored: StoredDoc, title = '', maxLength = 180): string {
  try {
    const blocks = childrenOf(stored?.doc as DocJSON | undefined);
    const first = blocks[0];
    const titleHeading = first?.type === 'heading' && plainText(first).trim() === title.trim();
    const headings = blocks.filter((b, i) => b.type === 'heading' && !(i === 0 && titleHeading));
    const clean = (texts: string[]) =>
      texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

    const lead = clean(first?.type === 'heading' && !titleHeading ? [plainText(first)] : []);
    const body = clean(blocks.filter((b) => b.type !== 'heading').flatMap(textBlocks));
    const parts = body.length > 0 ? [...lead, ...body] : clean(headings.map(plainText));

    const text = parts.reduce(
      (out, part) => (!out ? part : out + (/[.!?:;…]$/.test(out) ? ' ' : ' · ') + part),
      '',
    );
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
  } catch {
    return '';
  }
}

/** Counted like the editor's status bar, so library cards and the editor agree. */
export function extractDocWordCount(stored: StoredDoc): number {
  try {
    return countWords(plainText(stored?.doc as DocJSON | undefined));
  } catch {
    return 0;
  }
}

/** The document's text without formatting, blocks separated by spaces. */
export function extractDocText(stored: StoredDoc): string {
  try {
    return plainText(stored?.doc as DocJSON | undefined);
  } catch {
    return '';
  }
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

@Injectable({
  providedIn: 'root',
})
export class DocumentManager {
  async getIndex(): Promise<DocMeta[]> {
    if (typeof window === 'undefined') return [];
    try {
      const stored = await imageStorage.getDocument<DocMeta[]>(INDEX_KEY);
      if (Array.isArray(stored) && stored.length > 0) {
        this.dropLegacyCopy();
        return stored;
      }
      // Check legacy single-document storage
      const legacy = await imageStorage.getDocument<StoredDoc>(LEGACY_SAVED_KEY);
      if (legacy && legacy.doc) {
        const title = extractDocTitle(legacy);
        const wordCount = extractDocWordCount(legacy);
        const meta: DocMeta = {
          id: 'doc_default',
          title: title || 'Welcome to Inkframe',
          wordCount,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await imageStorage.saveDocument(docKey('doc_default'), legacy);
        await this.saveIndex([meta]);
        this.dropLegacyCopy();
        this.setActiveDocId('doc_default');
        return [meta];
      }
    } catch (e) {
      console.warn('Failed to read docs index:', e);
    }
    return [];
  }

  private legacyDropped = false;

  /**
   * Older versions mirrored every save into one legacy key. Once documents
   * live in the index that copy is stale (it holds whichever document was
   * saved last) and could resurrect deleted content, so remove it once.
   */
  private dropLegacyCopy(): void {
    if (this.legacyDropped) return;
    this.legacyDropped = true;
    void imageStorage.deleteDocument(LEGACY_SAVED_KEY);
  }

  /** Throws a StorageError when storage refuses the write. */
  async saveIndex(index: DocMeta[]): Promise<void> {
    if (typeof window === 'undefined') return;
    await imageStorage.saveDocument(INDEX_KEY, index);
  }

  getActiveDocId(): string {
    if (typeof window === 'undefined') return 'doc_default';
    try {
      return localStorage.getItem(ACTIVE_ID_KEY) || 'doc_default';
    } catch {
      return 'doc_default';
    }
  }

  setActiveDocId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ACTIVE_ID_KEY, id);
    } catch {
      // Storage unavailable: the active document is not remembered.
    }
  }

  async getDoc(id: string): Promise<StoredDoc | null> {
    if (typeof window === 'undefined') return null;
    try {
      const doc = await imageStorage.getDocument<StoredDoc>(docKey(id));
      if (doc && doc.doc) return doc;
      if (id === 'doc_default') {
        const legacy = await imageStorage.getDocument<StoredDoc>(LEGACY_SAVED_KEY);
        if (legacy && legacy.doc) return legacy;
      }
    } catch (e) {
      console.warn(`Failed to fetch doc ${id}:`, e);
    }
    return null;
  }

  /** Throws a StorageError when storage refuses the write. */
  async saveDoc(id: string, doc: StoredDoc, explicitTitle?: string): Promise<DocMeta> {
    const title = explicitTitle || extractDocTitle(doc);
    const wordCount = extractDocWordCount(doc);
    const excerpt = extractDocExcerpt(doc, title);
    const now = Date.now();

    // Persist doc content
    await imageStorage.saveDocument(docKey(id), doc);

    const index = await this.getIndex();
    const existingIdx = index.findIndex((d) => d.id === id);
    let meta: DocMeta;

    if (existingIdx >= 0) {
      meta = {
        ...index[existingIdx],
        title,
        wordCount,
        excerpt,
        excerptVersion: EXCERPT_VERSION,
        updatedAt: now,
      };
      index[existingIdx] = meta;
    } else {
      meta = {
        id,
        title,
        wordCount,
        excerpt,
        excerptVersion: EXCERPT_VERSION,
        createdAt: now,
        updatedAt: now,
      };
      index.unshift(meta);
    }

    // Sort index with most recently updated first
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.saveIndex(index);
    this.setActiveDocId(id);
    return meta;
  }

  /**
   * Adds previews to index entries saved before previews existed, and rebuilds
   * those made by an older EXCERPT_VERSION. Returns whether anything changed.
   * Edit times are left untouched.
   */
  async backfillExcerpts(): Promise<boolean> {
    const index = await this.getIndex();
    const stale = index.filter(
      (meta) => meta.excerpt === undefined || meta.excerptVersion !== EXCERPT_VERSION,
    );
    if (stale.length === 0) return false;
    for (const meta of stale) {
      const doc = await this.getDoc(meta.id);
      meta.excerpt = doc ? extractDocExcerpt(doc, meta.title) : '';
      meta.excerptVersion = EXCERPT_VERSION;
    }
    await this.saveIndex(index);
    return true;
  }

  async createDoc(
    title?: string,
    initialDoc?: StoredDoc,
  ): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const id = this.newDocId();
    const docTitle = title || 'Untitled Document';
    const doc: StoredDoc = initialDoc || {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: docTitle }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Start writing your document here...' }],
          },
        ],
      },
    };

    const meta = await this.saveDoc(id, doc, docTitle);
    this.setActiveDocId(id);
    return { meta, doc };
  }

  async deleteDoc(id: string): Promise<string> {
    let index = await this.getIndex();
    index = index.filter((d) => d.id !== id);

    // Documents live in IndexedDB (localStorage is only a fallback), so remove both.
    await imageStorage.deleteDocument(docKey(id));
    await deleteVersions(id);

    if (index.length === 0) {
      const created = await this.createDoc('Welcome to Inkframe ✦', WELCOME_DOC);
      // createDoc re-reads the stored index, which still lists the deleted doc.
      await this.saveIndex([created.meta]);
      return created.meta.id;
    }

    await this.saveIndex(index);
    const nextId = index[0].id;
    this.setActiveDocId(nextId);
    return nextId;
  }

  /**
   * Permanently deletes every document and image on this device. Preferences
   * such as the theme and sidebar state are kept.
   */
  async clearAll(): Promise<void> {
    await imageStorage.clearAll();
    try {
      if (typeof localStorage !== 'undefined') {
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
        for (const key of keys) {
          if (
            key &&
            (key.startsWith('inkframe_doc') ||
              key.startsWith(VERSION_KEY_PREFIX) ||
              key === ACTIVE_ID_KEY ||
              key === LEGACY_SAVED_KEY)
          ) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch {
      // Storage unavailable: there are no fallback copies to remove.
    }
    this.legacyDropped = false;
  }

  /**
   * Writes documents with their existing ids and metadata (edit times
   * included), adding them to the index or replacing entries with the same
   * id. Used to restore backups.
   */
  async putDocs(entries: { meta: DocMeta; doc: StoredDoc }[]): Promise<void> {
    if (entries.length === 0) return;
    for (const { meta, doc } of entries) {
      await imageStorage.saveDocument(docKey(meta.id), doc);
    }
    const ids = new Set(entries.map((e) => e.meta.id));
    const index = (await this.getIndex()).filter((d) => !ids.has(d.id));
    index.push(...entries.map((e) => e.meta));
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.saveIndex(index);
  }

  /** A fresh, unused document id. */
  newDocId(): string {
    return 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }

  async duplicateDoc(id: string): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const original = await this.getDoc(id);
    const index = await this.getIndex();
    const origMeta = index.find((d) => d.id === id);
    const newTitle = (origMeta?.title || 'Document') + ' (Copy)';
    const cloned: StoredDoc = original
      ? JSON.parse(JSON.stringify(original))
      : {
          schemaVersion: SCHEMA_VERSION,
          doc: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: newTitle }],
              },
            ],
          },
        };

    return this.createDoc(newTitle, cloned);
  }
}

// Backward compatibility alias
export { DocumentManager as DocumentManagerService };
