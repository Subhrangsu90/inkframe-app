import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DocumentManager, EXCERPT_VERSION, extractDocExcerpt } from './document-manager';
import { DOCUMENT_STORE, DocMeta, DocumentStore } from './document-store';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';

const docWith = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

// jsdom has no IndexedDB, so storage falls back to localStorage here.
describe('DocumentManager persistence', () => {
  let manager: DocumentManager;

  beforeEach(() => {
    localStorage.clear();
    manager = TestBed.inject(DocumentManager);
  });

  it('deleteDoc removes the stored content, not just the index entry', async () => {
    const a = await manager.createDoc('A', docWith('secret A'));
    await manager.createDoc('B', docWith('B'));

    await manager.deleteDoc(a.meta.id);

    expect(await manager.getDoc(a.meta.id)).toBeNull();
    expect(localStorage.getItem(`inkframe_doc_${a.meta.id}`)).toBeNull();
    expect((await manager.getIndex()).map((d) => d.id)).not.toContain(a.meta.id);
  });

  it('deleting the last document leaves only the new welcome document in the index', async () => {
    const only = await manager.createDoc('Only', docWith('only'));
    const nextId = await manager.deleteDoc(only.meta.id);

    const index = await manager.getIndex();
    expect(index.map((d) => d.id)).toEqual([nextId]);
    expect(nextId).not.toBe(only.meta.id);
  });

  it('reports a full storage instead of pretending the document was saved', async () => {
    const a = await manager.createDoc('A', docWith('first'));
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      await expect(manager.saveDoc(a.meta.id, docWith('second'))).rejects.toMatchObject({
        name: 'StorageError',
        reason: 'quota',
      });
    } finally {
      full.mockRestore();
    }
    expect(await manager.getDoc(a.meta.id)).toEqual(docWith('first'));
  });

  it('saves no longer mirror every document into the legacy key', async () => {
    await manager.createDoc('A', docWith('A'));
    expect(localStorage.getItem('inkframe_saved_doc')).toBeNull();
  });

  it('migrates a legacy document once, then removes the stale legacy copy', async () => {
    localStorage.setItem('inkframe_saved_doc', JSON.stringify(docWith('legacy text')));

    const index = await manager.getIndex();
    expect(index.map((d) => d.id)).toEqual(['doc_default']);
    expect((await manager.getDoc('doc_default'))?.doc).toEqual(docWith('legacy text').doc);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    expect(localStorage.getItem('inkframe_saved_doc')).toBeNull();
  });
});

describe('DocumentManager.clearAll', () => {
  beforeEach(() => localStorage.clear());

  it('removes every document but keeps preferences', async () => {
    const manager = TestBed.inject(DocumentManager);
    await manager.createDoc('A', docWith('A'));
    localStorage.setItem('inkframe-theme', 'light');
    localStorage.setItem('inkframe_sidebar_collapsed', 'true');

    await manager.clearAll();

    expect(await manager.getIndex()).toEqual([]);
    const remaining = Object.keys(localStorage);
    expect(remaining.sort()).toEqual(['inkframe-theme', 'inkframe_sidebar_collapsed']);
  });
});

describe('DocumentManager with another store', () => {
  /** A store in memory, standing in for the cloud store to come. */
  function memoryStore() {
    const docs = new Map<string, StoredDoc>();
    let index: DocMeta[] = [];
    const store: DocumentStore = {
      list: async () => index.map((meta) => ({ ...meta })),
      get: async (id) => docs.get(id) ?? null,
      put: async (entries) => {
        for (const { meta, doc } of entries) {
          if (doc) docs.set(meta.id, doc);
          index = [...index.filter((d) => d.id !== meta.id), meta];
        }
        index.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      remove: async (id) => {
        docs.delete(id);
        index = index.filter((d) => d.id !== id);
      },
      clear: async () => {
        docs.clear();
        index = [];
      },
    };
    return { store, docs };
  }

  it('keeps documents wherever DOCUMENT_STORE keeps them, and nothing on the device', async () => {
    localStorage.clear();
    const { store, docs } = memoryStore();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT_STORE, useValue: store }] });
    const manager = TestBed.inject(DocumentManager);

    const a = await manager.createDoc('A', docWith('first'));
    await manager.saveDoc(a.meta.id, docWith('second'));
    expect(docs.get(a.meta.id)).toEqual(docWith('second'));
    expect((await manager.getIndex()).map((d) => d.title)).toEqual(['second']);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('inkframe_doc'))).toEqual([]);

    // Deleting the last document still leaves the welcome document, in the same store.
    const next = await manager.deleteDoc(a.meta.id);
    expect(docs.has(a.meta.id)).toBe(false);
    expect([...docs.keys()]).toEqual([next]);
  });
});

describe('document previews', () => {
  const doc = (...content: any[]): StoredDoc => ({
    schemaVersion: SCHEMA_VERSION,
    doc: { type: 'doc', content },
  });
  const p = (...runs: any[]) => ({ type: 'paragraph', content: runs });
  const h1 = (text: string) => ({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text }],
  });

  it('skips the title heading and joins text runs and blocks naturally', () => {
    const stored = doc(
      h1('Plan'),
      p(
        { type: 'text', text: 'Ship ' },
        { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
        { type: 'text', text: 'ly.' },
      ),
      {
        type: 'bullet_list',
        content: [{ type: 'list_item', content: [p({ type: 'text', text: 'First' })] }],
      },
    );
    expect(extractDocExcerpt(stored, 'Plan')).toBe('Ship boldly. First');
  });

  it('keeps a leading heading that is not the title, set apart from the text', () => {
    expect(extractDocExcerpt(doc(h1('Intro'), p({ type: 'text', text: 'Body' })), 'Other')).toBe(
      'Intro · Body',
    );
  });

  it('leaves out section headings and separates blocks that do not end a sentence', () => {
    const h2 = (text: string) => ({ ...h1(text), attrs: { level: 2 } });
    const item = (text: string) => ({ type: 'list_item', content: [p({ type: 'text', text })] });
    const stored = doc(
      h1('Team Sync'),
      h2('Attendees'),
      p({ type: 'text', text: 'Alex, Sarah' }),
      h2('Decisions'),
      { type: 'bullet_list', content: [item('Ship the sidebar.'), item('Keep it local')] },
    );
    expect(extractDocExcerpt(stored, 'Meeting Notes')).toBe(
      'Team Sync · Alex, Sarah · Ship the sidebar. Keep it local',
    );
  });

  it('uses the headings when the document has no other text', () => {
    const h2 = (text: string) => ({ ...h1(text), attrs: { level: 2 } });
    expect(extractDocExcerpt(doc(h1('Plan'), h2('Goals'), h2('Risks'), p()), 'Plan')).toBe(
      'Goals · Risks',
    );
  });

  it('shortens long text at a word boundary', () => {
    const excerpt = extractDocExcerpt(doc(p({ type: 'text', text: 'word '.repeat(100) })), '', 23);
    expect(excerpt).toBe('word word word word…');
  });

  it('is saved with the document and backfilled for older index entries', async () => {
    localStorage.clear();
    const manager = TestBed.inject(DocumentManager);
    const { meta } = await manager.createDoc('Notes', docWith('Remember the milk'));
    expect(meta.excerpt).toBe('Remember the milk');
    expect(meta.excerptVersion).toBe(EXCERPT_VERSION);

    const index = await manager.getIndex();
    delete index[0].excerpt;
    delete index[0].excerptVersion;
    await TestBed.inject(DOCUMENT_STORE).put(index.map((meta) => ({ meta })));
    const before = index[0].updatedAt;

    expect(await manager.backfillExcerpts()).toBe(true);
    const [entry] = await manager.getIndex();
    expect(entry.excerpt).toBe('Remember the milk');
    expect(entry.updatedAt).toBe(before);
    expect(await manager.backfillExcerpts()).toBe(false);
  });

  it('rebuilds previews made by an older version of the format', async () => {
    localStorage.clear();
    const manager = TestBed.inject(DocumentManager);
    await manager.createDoc('Notes', docWith('Remember the milk'));
    const index = await manager.getIndex();
    index[0].excerpt = 'Notes Remember the milk';
    index[0].excerptVersion = EXCERPT_VERSION - 1;
    await TestBed.inject(DOCUMENT_STORE).put(index.map((meta) => ({ meta })));

    expect(await manager.backfillExcerpts()).toBe(true);
    const [entry] = await manager.getIndex();
    expect(entry.excerpt).toBe('Remember the milk');
    expect(entry.excerptVersion).toBe(EXCERPT_VERSION);
  });
});
