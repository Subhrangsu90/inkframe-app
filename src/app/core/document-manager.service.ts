import { Injectable } from '@angular/core';
import { StoredDoc } from '../editor';
import { imageStorage } from '../editor/core/image-storage';

export interface DocMeta {
  id: string;
  title: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

const INDEX_KEY = 'inkframe_docs_index';
const ACTIVE_ID_KEY = 'inkframe_active_doc_id';
const LEGACY_SAVED_KEY = 'inkframe_saved_doc';

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

export function extractDocWordCount(stored: StoredDoc): number {
  try {
    function getText(node: any): string {
      if (!node) return '';
      if (node.text) return node.text;
      if (Array.isArray(node.content)) {
        return node.content.map(getText).join(' ');
      }
      return '';
    }
    const fullText = getText(stored?.doc);
    return fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
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
export class DocumentManagerService {
  async getIndex(): Promise<DocMeta[]> {
    if (typeof window === 'undefined') return [];
    try {
      const stored = await imageStorage.getDocument<DocMeta[]>(INDEX_KEY);
      if (Array.isArray(stored) && stored.length > 0) {
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
        await imageStorage.saveDocument('inkframe_doc_doc_default', legacy);
        await this.saveIndex([meta]);
        this.setActiveDocId('doc_default');
        return [meta];
      }
    } catch (e) {
      console.warn('Failed to read docs index:', e);
    }
    return [];
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
      const doc = await imageStorage.getDocument<StoredDoc>(`inkframe_doc_${id}`);
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
    const now = Date.now();

    // Persist doc content
    await imageStorage.saveDocument(`inkframe_doc_${id}`, doc);
    // Keep legacy single-doc key synchronized for backward compatibility with existing tests
    await imageStorage.saveDocument(LEGACY_SAVED_KEY, doc);

    const index = await this.getIndex();
    const existingIdx = index.findIndex((d) => d.id === id);
    let meta: DocMeta;

    if (existingIdx >= 0) {
      meta = {
        ...index[existingIdx],
        title,
        wordCount,
        updatedAt: now,
      };
      index[existingIdx] = meta;
    } else {
      meta = {
        id,
        title,
        wordCount,
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

  async createDoc(
    title?: string,
    initialDoc?: StoredDoc,
  ): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const docTitle = title || 'Untitled Document';
    const doc: StoredDoc = initialDoc || {
      schemaVersion: 1,
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

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`inkframe_doc_${id}`);
      }
    } catch {}

    if (index.length === 0) {
      const created = await this.createDoc('Welcome to Inkframe');
      return created.meta.id;
    }

    await this.saveIndex(index);
    const nextId = index[0].id;
    this.setActiveDocId(nextId);
    return nextId;
  }

  async duplicateDoc(id: string): Promise<{ meta: DocMeta; doc: StoredDoc }> {
    const original = await this.getDoc(id);
    const index = await this.getIndex();
    const origMeta = index.find((d) => d.id === id);
    const newTitle = (origMeta?.title || 'Document') + ' (Copy)';
    const cloned: StoredDoc = original
      ? JSON.parse(JSON.stringify(original))
      : {
          schemaVersion: 1,
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
