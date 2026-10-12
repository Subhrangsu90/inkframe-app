import { Injectable } from '@angular/core';
import { SCHEMA_VERSION, StoredDoc, countWords, imageStorage } from '@inkframe-ui/editor/core';
import { WELCOME_DOC } from './welcome-doc';

export type { StoredDoc };

export interface DocMeta {
  id: string;
  title: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  /** Plain-text preview of the body. Missing on entries saved before previews existed. */
  excerpt?: string;
}

const INDEX_KEY = 'inkframe_docs_index';
const ACTIVE_ID_KEY = 'inkframe_active_doc_id';
const LEGACY_SAVED_KEY = 'inkframe_saved_doc';

const docKey = (id: string) => `inkframe_doc_${id}`;

export function extractDocTitle(stored: StoredDoc): string {
  try {
    const content = (stored?.doc as any)?.content;
    if (Array.isArray(content)) {
      for (const node of content) {
        if (node.type === 'heading' && Array.isArray(node.content)) {
          const text = node.content.map((c: any) => c.text || '').join('').trim();
          if (text) return text;
        }
      }
      for (const node of content) {
        if (node.type === 'paragraph' && Array.isArray(node.content)) {
          const text = node.content.map((c: any) => c.text || '').join('').trim();
          if (text) {
            return text.length > 40 ? text.slice(0, 40) + '...' : text;
          }
        }
      }
    }
  } catch {}
  return 'Untitled Document';
}

function plainText(node: any): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hard_break') return ' ';
  if (!Array.isArray(node.content)) return '';
  // Text runs inside one paragraph join directly; separate blocks get a space.
  const inline = node.content.every((c: any) => typeof c.text === 'string' || c.type === 'hard_break');
  return node.content.map(plainText).join(inline ? '' : ' ');
}

/**
 * A short plain-text preview of a document for lists and cards. The leading
 * heading is skipped when it is the document's title.
 */
export function extractDocExcerpt(stored: StoredDoc, title = '', maxLength = 180): string {
  try {
    const blocks: any[] = (stored?.doc as any)?.content ?? [];
    const first = blocks[0];
    const body =
      first?.type === 'heading' && plainText(first).trim() === title.trim() ? blocks.slice(1) : blocks;
    const text = body.map(plainText).join(' ').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
  } catch {
    return '';
  }
}

/** Counted like the editor's status bar, so library cards and the editor agree. */
export function extractDocWordCount(stored: StoredDoc): number {
  try {
    return countWords(plainText(stored?.doc));
  } catch {
    return 0;
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

  async saveIndex(index: DocMeta[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await imageStorage.saveDocument(INDEX_KEY, index);
    } catch (e) {
      console.warn('Failed to save docs index:', e);
    }
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
    } catch {}
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
        updatedAt: now,
      };
      index[existingIdx] = meta;
    } else {
      meta = {
        id,
        title,
        wordCount,
        excerpt,
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
   * Adds previews to index entries saved before previews existed. Returns
   * whether anything changed. Edit times are left untouched.
   */
  async backfillExcerpts(): Promise<boolean> {
    const index = await this.getIndex();
    const missing = index.filter((meta) => meta.excerpt === undefined);
    if (missing.length === 0) return false;
    for (const meta of missing) {
      const doc = await this.getDoc(meta.id);
      meta.excerpt = doc ? extractDocExcerpt(doc, meta.title) : '';
    }
    await this.saveIndex(index);
    return true;
  }

  async createDoc(
    title?: string,
    initialDoc?: StoredDoc,
  ): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
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
            (key.startsWith('inkframe_doc') || key === ACTIVE_ID_KEY || key === LEGACY_SAVED_KEY)
          ) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch {}
    this.legacyDropped = false;
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
