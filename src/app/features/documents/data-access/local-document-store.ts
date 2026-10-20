import { StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { deleteVersions, VERSION_KEY_PREFIX } from '../versions/version-store';
import { extractDocTitle, extractDocWordCount } from './doc-text';
import type { DocEntry, DocMeta, DocumentStore } from './document-store';

const INDEX_KEY = 'inkframe_docs_index';
const LEGACY_SAVED_KEY = 'inkframe_saved_doc';
/** The document the library opens; DocumentManager reads and writes it. */
export const ACTIVE_DOC_ID_KEY = 'inkframe_active_doc_id';

const docKey = (id: string) => `inkframe_doc_${id}`;

const newestFirst = (index: DocMeta[]) => index.sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * Documents in this device's IndexedDB (localStorage when IndexedDB is not
 * available), with an index of their entries. On the server, during
 * prerendering, there are no documents.
 */
export class LocalDocumentStore implements DocumentStore {
  private legacyDropped = false;

  async list(): Promise<DocMeta[]> {
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
        const meta: DocMeta = {
          id: 'doc_default',
          title: extractDocTitle(legacy) || 'Welcome to Inkframe',
          wordCount: extractDocWordCount(legacy),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await imageStorage.saveDocument(docKey('doc_default'), legacy);
        await this.writeIndex([meta]);
        this.dropLegacyCopy();
        try {
          localStorage.setItem(ACTIVE_DOC_ID_KEY, 'doc_default');
        } catch {
          // Storage unavailable: the active document is not remembered.
        }
        return [meta];
      }
    } catch (e) {
      console.warn('Failed to read docs index:', e);
    }
    return [];
  }

  async get(id: string): Promise<StoredDoc | null> {
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

  async put(entries: readonly DocEntry[]): Promise<void> {
    if (entries.length === 0) return;
    // Content first: an index entry never points at content that failed to save.
    for (const { meta, doc } of entries) {
      if (doc) await imageStorage.saveDocument(docKey(meta.id), doc);
    }
    const ids = new Set(entries.map((e) => e.meta.id));
    const index = (await this.list()).filter((d) => !ids.has(d.id));
    index.push(...entries.map((e) => e.meta));
    await this.writeIndex(newestFirst(index));
  }

  async remove(id: string): Promise<void> {
    const index = (await this.list()).filter((d) => d.id !== id);
    // Documents live in IndexedDB (localStorage is only a fallback), so remove both.
    await imageStorage.deleteDocument(docKey(id));
    await deleteVersions(id);
    await this.writeIndex(index);
  }

  /** Also forgets the active document. Preferences such as the theme are kept. */
  async clear(): Promise<void> {
    await imageStorage.clearAll();
    try {
      if (typeof localStorage !== 'undefined') {
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
        for (const key of keys) {
          if (
            key &&
            (key.startsWith('inkframe_doc') ||
              key.startsWith(VERSION_KEY_PREFIX) ||
              key === ACTIVE_DOC_ID_KEY ||
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

  /** Throws a StorageError when storage refuses the write. */
  private async writeIndex(index: DocMeta[]): Promise<void> {
    if (typeof window === 'undefined') return;
    await imageStorage.saveDocument(INDEX_KEY, index);
  }

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
}
