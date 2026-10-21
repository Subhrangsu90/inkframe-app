import { ImageStorage, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { deleteVersions, VERSION_KEY_PREFIX } from '../versions/version-store';
import { extractDocTitle, extractDocWordCount } from './doc-text';
import type { DocEntry, DocMeta, DocumentStore } from './document-store';

const INDEX_KEY = 'inkframe_docs_index';
const LEGACY_SAVED_KEY = 'inkframe_saved_doc';
/** The document the library opens; DocumentManager reads and writes it. */
export const ACTIVE_DOC_ID_KEY = 'inkframe_active_doc_id';

const docKey = (id: string) => `inkframe_doc_${id}`;

const newestFirst = (index: DocMeta[]) => index.sort((a, b) => b.updatedAt - a.updatedAt);

/** A new index, and the documents to write with it (null deletes one). */
interface IndexChange {
  index: DocMeta[];
  docs: readonly (readonly [id: string, doc: StoredDoc | null])[];
}

/**
 * Documents in this device's IndexedDB (localStorage when IndexedDB is not
 * available), with an index of their entries. On the server, during
 * prerendering, there are no documents.
 */
export class LocalDocumentStore implements DocumentStore {
  private legacyDropped = false;

  constructor(private readonly storage: ImageStorage = imageStorage) {}

  async list(): Promise<DocMeta[]> {
    if (typeof window === 'undefined') return [];
    try {
      const stored = await this.storage.getDocument<DocMeta[]>(INDEX_KEY);
      if (Array.isArray(stored) && stored.length > 0) {
        this.dropLegacyCopy();
        return stored;
      }
      // Check legacy single-document storage
      const legacy = await this.storage.getDocument<StoredDoc>(LEGACY_SAVED_KEY);
      if (legacy && legacy.doc) {
        const meta: DocMeta = {
          id: 'doc_default',
          title: extractDocTitle(legacy) || 'Welcome to Inkframe',
          wordCount: extractDocWordCount(legacy),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await this.put([{ meta, doc: legacy }]);
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
      const doc = await this.storage.getDocument<StoredDoc>(docKey(id));
      if (doc && doc.doc) return doc;
      if (id === 'doc_default') {
        const legacy = await this.storage.getDocument<StoredDoc>(LEGACY_SAVED_KEY);
        if (legacy && legacy.doc) return legacy;
      }
    } catch (e) {
      console.warn(`Failed to fetch doc ${id}:`, e);
    }
    return null;
  }

  async save(
    id: string,
    doc: StoredDoc,
    entry: (current: DocMeta | undefined) => DocMeta | null,
  ): Promise<DocMeta | null> {
    let saved: DocMeta | null = null;
    await this.changeIndex((index) => {
      saved = entry(index.find((d) => d.id === id));
      if (!saved) return null;
      return { index: [...index.filter((d) => d.id !== id), saved], docs: [[id, doc]] };
    });
    return saved;
  }

  async put(entries: readonly DocEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const ids = new Set(entries.map((e) => e.meta.id));
    await this.changeIndex((index) => ({
      index: [...index.filter((d) => !ids.has(d.id)), ...entries.map((e) => e.meta)],
      docs: entries.flatMap(({ meta, doc }) => (doc ? [[meta.id, doc] as const] : [])),
    }));
  }

  async remove(id: string): Promise<void> {
    await this.changeIndex((index) => ({
      index: index.filter((d) => d.id !== id),
      docs: [[id, null]],
    }));
    await deleteVersions(id);
  }

  /** Also forgets the active document. Preferences such as the theme are kept. */
  async clear(): Promise<void> {
    await this.storage.clearAll();
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

  /**
   * Changes the index, and the documents with it, in one storage step
   * (ImageStorage.updateDocuments). `change` gets the index as stored and
   * returns the new one, or null to write nothing. A failed read writes
   * nothing, so a storage error can never leave the index empty, and changes
   * other tabs make in between are kept. Throws a StorageError when storage
   * refuses it.
   */
  private async changeIndex(change: (index: DocMeta[]) => IndexChange | null): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.storage.updateDocuments([INDEX_KEY], (current) => {
      const stored = current.get(INDEX_KEY);
      const result = change(Array.isArray(stored) ? (stored as DocMeta[]) : []);
      const writes = new Map<string, unknown>();
      if (!result) return writes;
      // Content first: in localStorage, which writes one key at a time, an
      // index entry never points at content that failed to save.
      for (const [id, doc] of result.docs) writes.set(docKey(id), doc);
      writes.set(INDEX_KEY, newestFirst(result.index));
      return writes;
    });
  }

  /**
   * Older versions mirrored every save into one legacy key. Once documents
   * live in the index that copy is stale (it holds whichever document was
   * saved last) and could resurrect deleted content, so remove it once.
   */
  private dropLegacyCopy(): void {
    if (this.legacyDropped) return;
    this.legacyDropped = true;
    void this.storage.deleteDocument(LEGACY_SAVED_KEY);
  }
}
