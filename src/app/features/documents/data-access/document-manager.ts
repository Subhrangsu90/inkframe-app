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
import { DocumentChannel } from './document-channel';
import { ImageCleanup } from './image-cleanup';

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
  /** Other tabs hear of every change, to show the latest documents. */
  private readonly channel = inject(DocumentChannel);
  /** Deletes images no document shows any more. */
  private readonly imageCleanup = inject(ImageCleanup);

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

  /**
   * Saves edits to a document in the library. Resolves to its entry, or to
   * null when the library no longer has it (deleted, perhaps in another
   * tab): saving never brings a deleted document back. Throws a
   * StorageError when storage refuses the write.
   */
  saveDoc(id: string, doc: StoredDoc, explicitTitle?: string): Promise<DocMeta | null> {
    return this.write(id, doc, explicitTitle, false);
  }

  /** Saves a document, adding it to the library when `create`. */
  private async write(
    id: string,
    doc: StoredDoc,
    explicitTitle: string | undefined,
    create: boolean,
  ): Promise<DocMeta | null> {
    // Worked out before the store's transaction, which should stay short.
    const title = explicitTitle || extractDocTitle(doc);
    const wordCount = extractDocWordCount(doc);
    const excerpt = extractDocExcerpt(doc, title);
    const meta = await this.store.save(id, doc, (existing) => {
      if (!existing && !create) return null;
      const now = Date.now();
      return {
        ...existing,
        id,
        title,
        wordCount,
        excerpt,
        excerptVersion: EXCERPT_VERSION,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });
    if (meta) {
      this.setActiveDocId(id);
      this.channel.post({ type: 'saved', ids: [id] });
    }
    return meta;
  }

  /**
   * Adds previews to index entries saved before previews existed, and rebuilds
   * those made by an older EXCERPT_VERSION. Returns whether anything changed.
   * Edit times are left untouched.
   */
  async backfillExcerpts(): Promise<boolean> {
    const isStale = (meta: DocMeta) =>
      meta.excerpt === undefined || meta.excerptVersion !== EXCERPT_VERSION;
    const stale = (await this.store.list()).filter(isStale);
    if (stale.length === 0) return false;
    const excerpts = new Map<string, string>();
    for (const meta of stale) {
      const doc = await this.store.get(meta.id);
      excerpts.set(meta.id, doc ? extractDocExcerpt(doc, meta.title) : '');
    }
    // Into the entries as they are now: one saved meanwhile (in another tab,
    // say) has its own preview, and one deleted stays deleted.
    const changed = await this.store.updateEntries((current) => {
      const excerpt = excerpts.get(current.id);
      if (excerpt === undefined || !isStale(current)) return null;
      return { ...current, excerpt, excerptVersion: EXCERPT_VERSION };
    });
    if (changed) this.channel.post({ type: 'saved', ids: [] });
    return changed;
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

    const meta = await this.write(id, doc, docTitle, true);
    if (!meta) throw new Error(`Document ${id} was not created`);
    return { meta, doc };
  }

  /**
   * Deletes a document and returns the one to show next. Deleting the last
   * document creates the welcome document, so the library is never empty.
   */
  async deleteDoc(id: string): Promise<string> {
    // Read first: its images can go once nothing else shows them.
    const deleted = await this.store.get(id);
    await this.store.remove(id);
    this.channel.post({ type: 'deleted', ids: [id] });
    if (deleted) this.imageCleanup.afterDeleting(deleted);
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
  async clearAll(): Promise<void> {
    await this.store.clear();
    this.channel.post({ type: 'cleared' });
  }

  /**
   * Writes documents with their existing ids and metadata (edit times
   * included), adding them to the index or replacing entries with the same
   * id. Used to restore backups.
   */
  async putDocs(entries: { meta: DocMeta; doc: StoredDoc }[]): Promise<void> {
    await this.store.put(entries);
    this.channel.post({ type: 'saved', ids: entries.map((e) => e.meta.id) });
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
