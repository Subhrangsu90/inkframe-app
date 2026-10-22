import { describe, it, expect, afterEach, vi } from 'vitest';
import { imageStorage, StorageError } from './image-storage';

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
