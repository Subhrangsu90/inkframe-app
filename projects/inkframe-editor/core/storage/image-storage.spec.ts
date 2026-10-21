import { describe, it, expect, afterEach, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { ImageStorage, imageStorage, StorageError } from './image-storage';

// jsdom has no IndexedDB, so documents go to the localStorage fallback here.
describe('imageStorage writes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const refuseWrites = (name: string) =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('refused', name);
    });

  it('saves documents to localStorage when IndexedDB is unavailable', async () => {
    expect(await imageStorage.storageMode()).toBe('local');
    await imageStorage.saveDocument('inkframe_doc_a', { title: 'A' });
    expect(await imageStorage.getDocument('inkframe_doc_a')).toEqual({ title: 'A' });
  });

  it('reports every write to listeners, and stops after unsubscribing', async () => {
    const results: boolean[] = [];
    const off = imageStorage.onWrite((result) => results.push(result.ok));
    await imageStorage.saveDocument('k1', 1);
    refuseWrites('QuotaExceededError');
    await imageStorage.saveDocument('k2', 2).catch(() => undefined);
    off();
    await imageStorage.saveDocument('k3', 3).catch(() => undefined);
    expect(results).toEqual([true, false]);
  });

  it('throws a quota StorageError when storage is full', async () => {
    refuseWrites('QuotaExceededError');
    const error = await imageStorage.saveDocument('k', {}).catch((e) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.reason).toBe('quota');
  });

  it('throws an unavailable StorageError when the browser blocks storage', async () => {
    refuseWrites('SecurityError');
    const error = await imageStorage.saveDocument('k', {}).catch((e) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.reason).toBe('unavailable');
  });

  it('stores an image under a given id (for restoring backups)', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const meta = { id: 'img_restored', name: 'a.png', type: 'image/png', size: 3, createdAt: 5 };
    await imageStorage.putImage(meta, blob);
    expect((await imageStorage.getImage('img_restored'))?.blob).toBe(blob);
    expect(await imageStorage.getImage('img_missing')).toBeNull();
  });
});

/** Adds `item` to the list stored under `list`, the way the app changes its index. */
const append = (storage: ImageStorage, item: string) =>
  storage.updateDocuments(
    ['list'],
    (current) => new Map([['list', [...((current.get('list') as string[]) ?? []), item]]]),
  );

describe('imageStorage.updateDocuments (localStorage)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('writes what the update makes of the stored values, and deletes nulls', async () => {
    await imageStorage.saveDocument('list', ['a']);
    await imageStorage.saveDocument('old', 'x');
    await imageStorage.updateDocuments(['list', 'missing'], (current) => {
      expect([...current.keys()]).toEqual(['list']);
      return new Map<string, unknown>([
        ['list', [...(current.get('list') as string[]), 'b']],
        ['old', null],
      ]);
    });
    expect(await imageStorage.getDocument('list')).toEqual(['a', 'b']);
    expect(await imageStorage.getDocument('old')).toBeNull();
  });

  it('keeps every change when updates overlap', async () => {
    await Promise.all(['a', 'b', 'c'].map((item) => append(imageStorage, item)));
    expect(await imageStorage.getDocument('list')).toEqual(['a', 'b', 'c']);
  });

  it('writes nothing when the read fails', async () => {
    await imageStorage.saveDocument('list', ['kept']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError');
    });
    const update = vi.fn(() => new Map([['list', []]]));
    const error = await imageStorage.updateDocuments(['list'], update).catch((e) => e);
    vi.restoreAllMocks();

    expect(error).toBeInstanceOf(StorageError);
    expect(update).not.toHaveBeenCalled();
    expect(await imageStorage.getDocument('list')).toEqual(['kept']);
  });
});

describe('ImageStorage on IndexedDB', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** Two instances on one (fake) IndexedDB: two tabs of the app. */
  const twoTabs = () => {
    const idb = new IDBFactory();
    return [new ImageStorage(idb), new ImageStorage(idb)] as const;
  };

  it('keeps every change when two tabs update the same document at once', async () => {
    const [a, b] = twoTabs();
    expect(await a.storageMode()).toBe('indexeddb');
    const items = Array.from({ length: 12 }, (_, i) => `item ${i}`);
    await Promise.all(items.map((item, i) => append(i % 2 ? a : b, item)));
    expect((await b.getDocument<string[]>('list'))?.sort()).toEqual([...items].sort());
  });

  it('writes nothing when a read fails', async () => {
    const [tab] = twoTabs();
    await tab.saveDocument('list', ['kept']);
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('Connection lost', 'UnknownError');
    });
    const error = await append(tab, 'new').catch((e) => e);
    vi.restoreAllMocks();

    expect(error).toBeInstanceOf(StorageError);
    expect(await tab.getDocument('list')).toEqual(['kept']);
  });

  it('starts from a copy saved while IndexedDB was unavailable, then removes deleted ones', async () => {
    const [tab] = twoTabs();
    localStorage.setItem('list', JSON.stringify(['from localStorage']));
    localStorage.setItem('old', JSON.stringify('x'));
    await tab.updateDocuments(
      ['list'],
      (current) =>
        new Map<string, unknown>([
          ['list', [...(current.get('list') as string[]), 'new']],
          ['old', null],
        ]),
    );
    expect(await tab.getDocument('list')).toEqual(['from localStorage', 'new']);
    expect(localStorage.getItem('old')).toBeNull();
  });
});

describe('Image Storage (IndexedDB)', () => {
  it('returns original URL for external links', async () => {
    const extUrl = 'https://example.com/cat.png';
    const resolved = await imageStorage.resolveUrl(extUrl);
    expect(resolved).toBe(extUrl);
  });

  it('returns original data URLs directly', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
    const resolved = await imageStorage.resolveToDataUrl(dataUrl);
    expect(resolved).toBe(dataUrl);
  });

  it('resolves image URLs in HTML strings', async () => {
    const html = '<p>Photo</p><img src="https://example.com/photo.jpg" alt="test">';
    const resolved = await imageStorage.resolveHtmlImages(html);
    expect(resolved).toBe(html);
  });

  it('inlines document image nodes with data URLs', async () => {
    const testDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: 'data:image/png;base64,ABC',
              alt: 'Pic',
            },
          },
        ],
      },
    };
    const result = await imageStorage.inlineDocImages(testDoc);
    expect(result.doc.content[0].attrs.src).toBe('data:image/png;base64,ABC');
  });
});
