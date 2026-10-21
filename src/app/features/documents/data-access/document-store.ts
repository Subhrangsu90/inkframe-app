import { InjectionToken } from '@angular/core';
import type { StoredDoc } from '@inkframe-ui/editor/core';
import { LocalDocumentStore } from './local-document-store';

/** A document's entry in the library. */
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

/** A library entry, with the document's content when it is being written too. */
export interface DocEntry {
  meta: DocMeta;
  doc?: StoredDoc;
}

/**
 * Where documents are kept. The app reads and writes them only through
 * DocumentManager, which uses this interface, so a cloud store can work
 * beside the local one (M6.2) without the pages changing.
 */
export interface DocumentStore {
  /** Every document's entry, most recently edited first. */
  list(): Promise<DocMeta[]>;
  /** A document's content, or null when there is none. */
  get(id: string): Promise<StoredDoc | null>;
  /**
   * Saves a document's content and its entry in one step. `entry` gets the
   * entry as stored at that moment (undefined when the library has none)
   * and returns the entry to save, or null to save nothing. Resolves to the
   * entry saved, or null. Throws a StorageError when storage refuses it.
   */
  save(
    id: string,
    doc: StoredDoc,
    entry: (current: DocMeta | undefined) => DocMeta | null,
  ): Promise<DocMeta | null>;
  /**
   * Writes documents and their entries, adding entries or replacing those
   * with the same id. An entry without `doc` updates the entry only. Throws
   * a StorageError when storage refuses the write.
   */
  put(entries: readonly DocEntry[]): Promise<void>;
  /** Deletes a document, its entry and its version history. */
  remove(id: string): Promise<void>;
  /** Deletes every document, version and image the store holds. */
  clear(): Promise<void>;
}

/** The app's document store: this device's IndexedDB. */
export const DOCUMENT_STORE = new InjectionToken<DocumentStore>('DocumentStore', {
  providedIn: 'root',
  factory: () => new LocalDocumentStore(),
});
