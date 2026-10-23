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

  it('never empties the library when reading its index fails', async () => {
    const a = await manager.createDoc('A', docWith('A'));
    const b = await manager.createDoc('B', docWith('B'));
    const getItem = Storage.prototype.getItem;
    const failing = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === 'inkframe_docs_index') throw new DOMException('Connection lost', 'UnknownError');
      return getItem.call(this, key);
    });
    const outcome = await manager.createDoc('C', docWith('C')).catch((e) => e);
    failing.mockRestore();

    expect(outcome).toMatchObject({ name: 'StorageError' });
    expect((await manager.getIndex()).map((d) => d.id).sort()).toEqual(
      [a.meta.id, b.meta.id].sort(),
    );
  });

  it('never brings back a document deleted meanwhile (in another tab, say)', async () => {
    const a = await manager.createDoc('A', docWith('A'));
    await manager.createDoc('B', docWith('B'));
    await manager.deleteDoc(a.meta.id);

    expect(await manager.saveDoc(a.meta.id, docWith('late edit'))).toBeNull();
    expect(await manager.getDoc(a.meta.id)).toBeNull();
    expect((await manager.getIndex()).map((d) => d.id)).not.toContain(a.meta.id);
  });

  it('keeps every document in the index when saves and new documents overlap', async () => {
    const a = await manager.createDoc('A', docWith('A'));
    // Not awaited one by one: each reads and writes the index.
    const created = await Promise.all([
      manager.saveDoc(a.meta.id, docWith('A, edited')),
      manager.createDoc('B', docWith('B')),
      manager.createDoc('C', docWith('C')),
      manager.saveDoc(a.meta.id, docWith('A, edited again')),
    ]);

    const ids = (await manager.getIndex()).map((d) => d.id).sort();
    expect(ids).toEqual([a.meta.id, created[1].meta.id, created[2].meta.id].sort());
    expect(await manager.getDoc(a.meta.id)).toEqual(docWith('A, edited again'));
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
      save: async (id, doc, entry) => {
        const meta = entry(index.find((d) => d.id === id));
        if (!meta) return null;
        docs.set(id, doc);
        index = [...index.filter((d) => d.id !== id), meta].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        return meta;
      },
      put: async (entries) => {
        for (const { meta, doc } of entries) {
          if (doc) docs.set(meta.id, doc);
          index = [...index.filter((d) => d.id !== meta.id), meta];
        }
        index.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      updateEntries: async (update) => {
        let changed = false;
        index = index.map((meta) => {
          const updated = update(meta);
          if (updated) changed = true;
          return updated ?? meta;
        });
        return changed;
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

  it('leaves alone what changed while previews were being made (in another tab, say)', async () => {
    localStorage.clear();
    const manager = TestBed.inject(DocumentManager);
    const store = TestBed.inject(DOCUMENT_STORE);
    const saved = await manager.createDoc('Saved', docWith('old text'));
    const deleted = await manager.createDoc('Deleted', docWith('gone'));
    await manager.createDoc('Kept', docWith('kept'));
    const index = await manager.getIndex();
    index.forEach((meta) => delete meta.excerpt);
    await store.put(index.map((meta) => ({ meta })));

    // While the backfill reads the first document, the other tab acts.
    const get = store.get.bind(store);
    let acted = false;
    vi.spyOn(store, 'get').mockImplementation(async (id) => {
      if (!acted) {
        acted = true;
        await manager.saveDoc(saved.meta.id, docWith('new text'), 'Renamed');
        await manager.deleteDoc(deleted.meta.id);
      }
      return get(id);
    });
    await manager.backfillExcerpts();
    vi.restoreAllMocks();

    const after = await manager.getIndex();
    expect(after.map((d) => d.title).sort()).toEqual(['Kept', 'Renamed']);
    expect(after.find((d) => d.title === 'Renamed')?.excerpt).toBe('new text');
    expect(after.find((d) => d.title === 'Kept')?.excerpt).toBe('kept');
  });
});

describe('document previews of long documents', () => {
  const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const long = (paragraphs: number): StoredDoc => ({
    schemaVersion: SCHEMA_VERSION,
    doc: {
      type: 'doc',
      content: Array.from({ length: paragraphs }, (_, i) => p(`Paragraph ${i} has words`)),
    },
  });

  it('reads only as far as the preview reaches, with the same result', () => {
    const preview = extractDocExcerpt(long(20));
    expect(preview.endsWith('…')).toBe(true);
    expect(extractDocExcerpt(long(20_000))).toBe(preview);
  });

  it('keeps text that fits exactly, and shortens text one character longer', () => {
    const exactly = (n: number): StoredDoc => ({
      schemaVersion: SCHEMA_VERSION,
      doc: { type: 'doc', content: [p('a'.repeat(n - 4) + ' end')] },
    });
    expect(extractDocExcerpt(exactly(30), '', 30)).toBe('a'.repeat(26) + ' end');
    expect(extractDocExcerpt(exactly(31), '', 30)).toBe('a'.repeat(27) + '…');
  });
});
