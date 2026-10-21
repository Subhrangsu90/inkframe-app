import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ImageStorage, SCHEMA_VERSION, StorageError, StoredDoc } from '@inkframe-ui/editor/core';
import { LocalDocumentStore } from './local-document-store';
import type { DocMeta } from './document-store';

const docWith = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const meta = (id: string, updatedAt = 1): DocMeta => ({
  id,
  title: id,
  wordCount: 1,
  createdAt: 1,
  updatedAt,
});
const ids = async (store: LocalDocumentStore) => (await store.list()).map((d) => d.id).sort();

// The store on IndexedDB (a fake one; jsdom has none), as in browsers.
describe('LocalDocumentStore on IndexedDB', () => {
  // Without an index in IndexedDB, the store starts from localStorage's copy.
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  /** Two stores on one IndexedDB: the library in two tabs. */
  const twoTabs = () => {
    const idb = new IDBFactory();
    return [
      new LocalDocumentStore(new ImageStorage(idb)),
      new LocalDocumentStore(new ImageStorage(idb)),
    ] as const;
  };

  it('never empties the index when reading it fails', async () => {
    const [tab] = twoTabs();
    await tab.put([
      { meta: meta('a'), doc: docWith('A') },
      { meta: meta('b'), doc: docWith('B') },
    ]);
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
      throw new DOMException('Connection lost', 'UnknownError');
    });

    await expect(tab.save('c', docWith('C'), () => meta('c'))).rejects.toBeInstanceOf(StorageError);
    expect(await ids(tab)).toEqual(['a', 'b']);
  });

  it('keeps the documents both tabs save at the same time', async () => {
    const [one, two] = twoTabs();
    await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
        (i % 2 ? one : two).save(id, docWith(id), () => meta(id, i)),
      ),
    );
    expect(await ids(one)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('saves nothing when the entry says not to (a document deleted in the other tab)', async () => {
    const [one, two] = twoTabs();
    await one.put([{ meta: meta('a'), doc: docWith('A') }]);
    await two.remove('a');

    const saved = await one.save('a', docWith('late edit'), (current) => current ?? null);
    expect(saved).toBeNull();
    expect(await one.get('a')).toBeNull();
    expect(await ids(one)).toEqual([]);
  });

  it('saves a document and its entry together, newest first', async () => {
    const [tab] = twoTabs();
    await tab.save('old', docWith('old'), () => meta('old', 1));
    const saved = await tab.save('new', docWith('new'), () => meta('new', 2));

    expect(saved?.id).toBe('new');
    expect((await tab.list()).map((d) => d.id)).toEqual(['new', 'old']);
    expect(await tab.get('new')).toEqual(docWith('new'));
  });
});
