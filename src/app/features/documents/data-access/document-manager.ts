import { Injectable, inject } from '@angular/core';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
import { WELCOME_DOC } from './welcome-doc';
import { withDefaultPageSetup } from './page-setup-default';
import {
  EXCERPT_VERSION,
  extractDocExcerpt,
  extractDocTitle,
  extractDocWordCount,
} from './doc-text';
import { DOCUMENT_STORE, DocMeta } from './document-store';
import { ACTIVE_DOC_ID_KEY } from './local-document-store';

export type { StoredDoc };
export type { DocMeta } from './document-store';
export {
  EXCERPT_VERSION,
  extractDocExcerpt,
  extractDocText,
  extractDocTitle,
  extractDocWordCount,
} from './doc-text';

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

/**
 * The document library: creating, saving, copying and deleting documents,
 * with their titles, word counts and previews. Where documents are kept is
 * up to the DOCUMENT_STORE (this device's IndexedDB by default).
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentManager {
  private readonly store = inject(DOCUMENT_STORE);

  getIndex(): Promise<DocMeta[]> {
    return this.store.list();
  }

  getActiveDocId(): string {
    if (typeof window === 'undefined') return 'doc_default';
    try {
      return localStorage.getItem(ACTIVE_DOC_ID_KEY) || 'doc_default';
    } catch {
      return 'doc_default';
    }
  }

  setActiveDocId(id: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ACTIVE_DOC_ID_KEY, id);
    } catch {
      // Storage unavailable: the active document is not remembered.
    }
  }

  getDoc(id: string): Promise<StoredDoc | null> {
    return this.store.get(id);
  }

  /** Throws a StorageError when storage refuses the write. */
  async saveDoc(id: string, doc: StoredDoc, explicitTitle?: string): Promise<DocMeta> {
    const title = explicitTitle || extractDocTitle(doc);
    const now = Date.now();
    const existing = (await this.store.list()).find((d) => d.id === id);
    const meta: DocMeta = {
      ...existing,
      id,
      title,
      wordCount: extractDocWordCount(doc),
      excerpt: extractDocExcerpt(doc, title),
      excerptVersion: EXCERPT_VERSION,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.store.put([{ meta, doc }]);
    this.setActiveDocId(id);
    return meta;
  }

  /**
   * Adds previews to index entries saved before previews existed, and rebuilds
   * those made by an older EXCERPT_VERSION. Returns whether anything changed.
   * Edit times are left untouched.
   */
  async backfillExcerpts(): Promise<boolean> {
    const stale = (await this.store.list()).filter(
      (meta) => meta.excerpt === undefined || meta.excerptVersion !== EXCERPT_VERSION,
    );
    if (stale.length === 0) return false;
    for (const meta of stale) {
      const doc = await this.store.get(meta.id);
      meta.excerpt = doc ? extractDocExcerpt(doc, meta.title) : '';
      meta.excerptVersion = EXCERPT_VERSION;
    }
    await this.store.put(stale.map((meta) => ({ meta })));
    return true;
  }

  /**
   * Creates and saves a document. Blank documents get the default page
   * setup ("Set as default" in Page setup); pass `defaultPageSetup: true`
   * for other new documents (templates, imports), not for copies.
   */
  async createDoc(
    title?: string,
    initialDoc?: StoredDoc,
    options: { defaultPageSetup?: boolean } = {},
  ): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const id = this.newDocId();
    const docTitle = title || 'Untitled Document';
    let doc: StoredDoc = initialDoc || {
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
    if (options.defaultPageSetup ?? !initialDoc) doc = withDefaultPageSetup(doc);

    const meta = await this.saveDoc(id, doc, docTitle);
    this.setActiveDocId(id);
    return { meta, doc };
  }

  /**
   * Deletes a document and returns the one to show next. Deleting the last
   * document creates the welcome document, so the library is never empty.
   */
  async deleteDoc(id: string): Promise<string> {
    await this.store.remove(id);
    const index = await this.store.list();
    if (index.length === 0) {
      const created = await this.createDoc('Welcome to Inkframe ✦', WELCOME_DOC);
      return created.meta.id;
    }
    const nextId = index[0].id;
    this.setActiveDocId(nextId);
    return nextId;
  }

  /**
   * Permanently deletes every document and image on this device. Preferences
   * such as the theme and sidebar state are kept.
   */
  clearAll(): Promise<void> {
    return this.store.clear();
  }

  /**
   * Writes documents with their existing ids and metadata (edit times
   * included), adding them to the index or replacing entries with the same
   * id. Used to restore backups.
   */
  putDocs(entries: { meta: DocMeta; doc: StoredDoc }[]): Promise<void> {
    return this.store.put(entries);
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
