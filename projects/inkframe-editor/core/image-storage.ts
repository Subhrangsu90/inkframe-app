/**
 * IndexedDB storage for images in Inkframe.
 * SSR-safe: handles server environments without errors.
 */
import type { DocJSON } from './migrations';

export interface StoredImageMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

interface ImageRecord extends StoredImageMetadata {
  blob: Blob;
}

/**
 * Why browser storage refused a write: `quota` when it is full, `unavailable`
 * when the browser blocks it (site data disabled, some private windows) or the
 * write failed for another reason.
 */
export type StorageFailure = 'quota' | 'unavailable';

/** Thrown by writes that browser storage refused. Nothing was saved. */
export class StorageError extends Error {
  constructor(
    readonly reason: StorageFailure,
    options?: { cause?: unknown },
  ) {
    super(
      reason === 'quota' ? 'Browser storage is full' : 'Browser storage is unavailable',
      options,
    );
    this.name = 'StorageError';
  }
}

/**
 * Where documents are kept: IndexedDB normally; localStorage (small, and no
 * images) when IndexedDB is blocked; nowhere when both are blocked.
 */
export type StorageMode = 'indexeddb' | 'local' | 'none';

/** Receives the outcome of every document and image write. */
export type StorageWriteListener = (
  result: { ok: true } | { ok: false; error: StorageError },
) => void;

export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

const DB_NAME = 'inkframe_storage';
const STORE_NAME = 'images';
const DOC_STORE_NAME = 'documents';
const DB_VERSION = 2;

class ImageStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly urlCache = new Map<string, string>();
  private readonly dataUrlCache = new Map<string, string>();
  private readonly blobCache = new Map<string, Blob>();
  private readonly metaCache = new Map<string, StoredImageMetadata>();
  private readonly writeListeners = new Set<StorageWriteListener>();

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private getDB(): Promise<IDBDatabase | null> {
    if (!this.isBrowser() || typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DOC_STORE_NAME)) {
          db.createObjectStore(DOC_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // Release the connection when another tab deletes or upgrades the
        // database; otherwise that request stays blocked indefinitely.
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        resolve(null);
      };
    });

    return this.dbPromise;
  }

  /**
   * Calls `listener` after every document and image write with its outcome,
   * for apps that show storage health. Returns a function that removes it.
   */
  onWrite(listener: StorageWriteListener): () => void {
    this.writeListeners.add(listener);
    return () => this.writeListeners.delete(listener);
  }

  private report(error?: StorageError): void {
    const result = error ? ({ ok: false, error } as const) : ({ ok: true } as const);
    for (const listener of this.writeListeners) {
      try {
        listener(result);
      } catch (e) {
        console.error('Storage write listener failed:', e);
      }
    }
  }

  /** Where documents are saved in this browser (see StorageMode). */
  async storageMode(): Promise<StorageMode> {
    if (!this.isBrowser()) return 'none';
    if (await this.getDB()) return 'indexeddb';
    try {
      // Reading throws when the browser blocks site data.
      localStorage.getItem(DOC_STORE_NAME);
      return 'local';
    } catch {
      return 'none';
    }
  }

  /**
   * Runs one IndexedDB write and resolves once it is committed: a request can
   * succeed and its transaction still abort, which is how quota errors arrive.
   * Throws a StorageError; every outcome goes to the write listeners.
   */
  private async idbWrite(storeName: string, write: (store: IDBObjectStore) => void): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      const db = await this.getDB();
      if (!db) {
        const error = new StorageError('unavailable');
        this.report(error);
        throw error;
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          // A failed request aborts the transaction. Wait for that: when a
          // transaction aborts, its other requests fail with AbortError first,
          // while tx.error holds the cause (QuotaExceededError when full).
          let requestError: DOMException | null = null;
          tx.onerror = (event) => {
            requestError ??= (event.target as IDBRequest | null)?.error ?? null;
          };
          tx.oncomplete = () => resolve();
          tx.onabort = () =>
            reject(tx.error ?? requestError ?? new DOMException('Write aborted', 'AbortError'));
          write(tx.objectStore(storeName));
        });
        this.report();
        return;
      } catch (e) {
        // A connection that another tab closed (by deleting or upgrading the
        // database) cannot start transactions: reopen it once and retry.
        if (attempt === 0 && e instanceof DOMException && e.name === 'InvalidStateError') {
          this.dbPromise = null;
          continue;
        }
        const error = new StorageError(isQuotaError(e) ? 'quota' : 'unavailable', { cause: e });
        this.report(error);
        throw error;
      }
    }
  }

  /**
   * Converts a Blob or File to a Base64 Data URL.
   */
  blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      if (typeof FileReader === 'undefined') {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Saves an image file or blob to IndexedDB and returns a stable custom URI
   * with format: ink-idb:<id> and a temporary preview object URL.
   */
  async saveImage(
    file: File | Blob,
    name?: string,
  ): Promise<{ id: string; uri: string; url: string }> {
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fileName = name || (file instanceof File ? file.name : 'image.png');
    const uri = `ink-idb:${id}`;

    this.blobCache.set(id, file);

    if (!this.isBrowser()) {
      return { id, uri, url: '' };
    }

    const objectUrl = URL.createObjectURL(file);
    this.urlCache.set(id, objectUrl);

    // Pre-cache data URL asynchronously for instant sharing and exports
    this.blobToDataUrl(file)
      .then((dUrl) => {
        if (dUrl) this.dataUrlCache.set(id, dUrl);
      })
      .catch(() => {
        // Only a cache: resolveToDataUrl() converts the blob when it is needed.
      });

    const record: ImageRecord = {
      id,
      name: fileName,
      type: file.type || 'image/png',
      size: file.size,
      createdAt: Date.now(),
      blob: file,
    };
    const { blob: _blob, ...meta } = record;
    this.metaCache.set(id, meta);

    // Without IndexedDB the image lives in memory for this visit only.
    if (await this.getDB()) {
      await this.idbWrite(STORE_NAME, (store) => store.put(record));
    }

    return { id, uri, url: objectUrl };
  }

  /**
   * Stores an image under a known id, replacing any image with that id. Used
   * to restore backups, whose documents refer to images as `ink-idb:<id>`.
   */
  async putImage(meta: StoredImageMetadata, blob: Blob): Promise<void> {
    this.blobCache.set(meta.id, blob);
    this.metaCache.set(meta.id, meta);
    const cached = this.urlCache.get(meta.id);
    if (cached) {
      URL.revokeObjectURL(cached);
      this.urlCache.delete(meta.id);
    }
    this.dataUrlCache.delete(meta.id);
    if (!this.isBrowser() || !(await this.getDB())) return;
    const record: ImageRecord = { ...meta, blob };
    await this.idbWrite(STORE_NAME, (store) => store.put(record));
  }

  /** An image's metadata and data, or null when there is no image with this id. */
  async getImage(id: string): Promise<{ meta: StoredImageMetadata; blob: Blob } | null> {
    const db = await this.getDB();
    if (db) {
      const record = await new Promise<ImageRecord | undefined>((resolve) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result as ImageRecord | undefined);
        req.onerror = () => resolve(undefined);
      });
      if (record) {
        const { blob, ...meta } = record;
        return { meta, blob };
      }
    }
    // Images saved while IndexedDB was unavailable exist only in memory.
    const blob = this.blobCache.get(id);
    if (!blob) return null;
    const meta = this.metaCache.get(id) ?? {
      id,
      name: 'image',
      type: blob.type || 'image/png',
      size: blob.size,
      createdAt: Date.now(),
    };
    return { meta, blob };
  }

  /**
   * Retrieves image blob from IndexedDB.
   */
  async getImageBlob(id: string): Promise<Blob | null> {
    const inMemory = this.blobCache.get(id);
    if (inMemory) return inMemory;

    const db = await this.getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as ImageRecord | undefined;
        resolve(record ? record.blob : null);
      };
      req.onerror = () => resolve(null);
    });
  }

  /**
   * Resolves any src string to a displayable URL (converts ink-idb: into blob URL or data URL).
   */
  async resolveUrl(src: string): Promise<string> {
    if (!src) return '';
    if (!src.startsWith('ink-idb:')) return src;

    const id = src.slice('ink-idb:'.length);
    const cached = this.urlCache.get(id);
    if (cached) return cached;

    const cachedData = this.dataUrlCache.get(id);
    if (cachedData) return cachedData;

    const blob = await this.getImageBlob(id);
    if (blob && this.isBrowser()) {
      const url = URL.createObjectURL(blob);
      this.urlCache.set(id, url);
      return url;
    }

    return src;
  }

  /**
   * Resizes and compresses an image Blob to fit cleanly inside URL share links.
   */
  async optimizeImageBlob(
    blob: Blob,
    maxWidth = 960,
    maxHeight = 960,
    quality = 0.72,
  ): Promise<string> {
    if (
      typeof document === 'undefined' ||
      typeof Image === 'undefined' ||
      (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
    ) {
      return this.blobToDataUrl(blob);
    }
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const url = URL.createObjectURL(blob);
      const img = new Image();

      timer = setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Already revoked.
        }
        this.blobToDataUrl(blob).then(resolve);
      }, 1500);

      img.onload = () => {
        if (timer) clearTimeout(timer);
        URL.revokeObjectURL(url);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          this.blobToDataUrl(blob).then(resolve);
          return;
        }
        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          this.blobToDataUrl(blob).then(resolve);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => {
        if (timer) clearTimeout(timer);
        URL.revokeObjectURL(url);
        this.blobToDataUrl(blob).then(resolve);
      };
      img.src = url;
    });
  }

  /**
   * Resolves any src string to a self-contained Base64 Data URL.
   * If optimize is true and the image is large, compresses and resizes it for URLs.
   */
  async resolveToDataUrl(src: string, optimize = false): Promise<string> {
    if (!src) return '';

    if (src.startsWith('ink-idb:')) {
      const id = src.slice('ink-idb:'.length);
      const blob = await this.getImageBlob(id);
      if (blob) {
        if (optimize) {
          return await this.optimizeImageBlob(blob);
        }
        const cached = this.dataUrlCache.get(id);
        if (cached) return cached;
        const dataUrl = await this.blobToDataUrl(blob);
        if (dataUrl) {
          this.dataUrlCache.set(id, dataUrl);
          return dataUrl;
        }
      }
      return src;
    }

    if (src.startsWith('blob:') && this.isBrowser()) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        if (optimize) {
          return await this.optimizeImageBlob(blob);
        }
        return await this.blobToDataUrl(blob);
      } catch {
        return src;
      }
    }

    if (src.startsWith('data:') && optimize && this.isBrowser()) {
      // If data URL is larger than 100KB, optimize it
      if (src.length > 100000) {
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          return await this.optimizeImageBlob(blob);
        } catch {
          return src;
        }
      }
      return src;
    }

    return src;
  }

  /**
   * Replaces all ink-idb: (and optionally blob:) URLs in an HTML string with displayable URLs.
   */
  async resolveHtmlImages(html: string, asDataUrl = false): Promise<string> {
    if (!html) return '';
    if (!html.includes('ink-idb:') && (!asDataUrl || !html.includes('blob:'))) {
      return html;
    }

    if (this.isBrowser() && typeof document !== 'undefined') {
      const container = document.createElement('div');
      container.innerHTML = html;
      const imgs = Array.from(container.querySelectorAll('img'));
      for (const img of imgs) {
        const rawSrc = img.getAttribute('src');
        if (!rawSrc) continue;
        if (rawSrc.startsWith('ink-idb:') || (asDataUrl && rawSrc.startsWith('blob:'))) {
          const resolved = asDataUrl
            ? await this.resolveToDataUrl(rawSrc)
            : await this.resolveUrl(rawSrc);
          if (resolved && resolved !== rawSrc) {
            img.setAttribute('src', resolved);
          }
        }
      }
      return container.innerHTML;
    }

    const srcRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*>/gi;
    const matches: { fullTag: string; rawSrc: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = srcRegex.exec(html)) !== null) {
      matches.push({ fullTag: match[0], rawSrc: match[1] });
    }

    if (matches.length === 0) return html;

    let result = html;
    for (const { fullTag, rawSrc } of matches) {
      if (rawSrc.startsWith('ink-idb:') || (asDataUrl && rawSrc.startsWith('blob:'))) {
        const resolved = asDataUrl
          ? await this.resolveToDataUrl(rawSrc)
          : await this.resolveUrl(rawSrc);

        if (resolved && resolved !== rawSrc) {
          const updatedTag = fullTag
            .replace(`src="${rawSrc}"`, `src="${resolved}"`)
            .replace(`src='${rawSrc}'`, `src='${resolved}'`);
          result = result.replace(fullTag, updatedTag);
        }
      }
    }

    return result;
  }

  /**
   * Inlines all ink-idb image nodes in a document as Base64 data URLs for portable sharing and persistence.
   */
  async inlineDocImages<T = unknown>(storedDoc: T, forShare = false): Promise<T> {
    if (!storedDoc || typeof storedDoc !== 'object') return storedDoc;
    const clone: T = JSON.parse(JSON.stringify(storedDoc));

    const traverse = async (node: DocJSON | undefined): Promise<void> => {
      if (!node) return;
      const src = node.attrs?.['src'];
      if (node.type === 'image' && typeof src === 'string') {
        if (
          src.startsWith('ink-idb:') ||
          src.startsWith('blob:') ||
          (forShare && src.startsWith('data:'))
        ) {
          const dataUrl = await this.resolveToDataUrl(src, forShare);
          if (dataUrl && dataUrl.startsWith('data:')) {
            node.attrs!['src'] = dataUrl;
          }
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          await traverse(child);
        }
      }
    };

    // A StoredDoc envelope or a bare document.
    const docRoot = ((clone as { doc?: DocJSON }).doc ?? clone) as DocJSON;
    await traverse(docRoot);
    return clone;
  }

  /**
   * Replaces ink-idb:... image URLs in Markdown text with Data URLs.
   */
  async resolveMarkdownImages(md: string): Promise<string> {
    if (!md) return '';
    const imgRegex = /!\[([^\]]*)\]\((ink-idb:[^)]+)\)/g;
    const matches = Array.from(md.matchAll(imgRegex));
    if (matches.length === 0) return md;

    let result = md;
    for (const m of matches) {
      const alt = m[1];
      const rawSrc = m[2];
      const dataUrl = await this.resolveToDataUrl(rawSrc);
      if (dataUrl && dataUrl !== rawSrc) {
        result = result.replace(m[0], `![${alt}](${dataUrl})`);
      }
    }
    return result;
  }

  /**
   * Lists all stored images metadata.
   */
  async listImages(): Promise<StoredImageMetadata[]> {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = (req.result || []) as ImageRecord[];
        resolve(
          records.map(({ id, name, type, size, createdAt }) => ({
            id,
            name,
            type,
            size,
            createdAt,
          })),
        );
      };
      req.onerror = () => resolve([]);
    });
  }

  /**
   * Deletes an image from IndexedDB.
   */
  async deleteImage(id: string): Promise<void> {
    const db = await this.getDB();
    if (!db) return;

    const cached = this.urlCache.get(id);
    if (cached) {
      URL.revokeObjectURL(cached);
      this.urlCache.delete(id);
    }
    this.dataUrlCache.delete(id);
    this.blobCache.delete(id);
    this.metaCache.delete(id);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persists a document in IndexedDB, or in localStorage when IndexedDB is
   * unavailable. Throws a StorageError when storage refuses it; nothing is
   * saved then.
   */
  async saveDocument<T = unknown>(key: string, doc: T): Promise<void> {
    if (!this.isBrowser()) return;
    if (await this.getDB()) {
      // No localStorage fallback when an IndexedDB write fails: getDocument()
      // reads IndexedDB first, so the fallback copy would be hidden behind the
      // older one there and the edit lost on reload.
      await this.idbWrite(DOC_STORE_NAME, (store) => store.put(doc, key));
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(doc));
    } catch (e) {
      const error = new StorageError(isQuotaError(e) ? 'quota' : 'unavailable', { cause: e });
      this.report(error);
      throw error;
    }
    this.report();
  }

  /**
   * Permanently deletes the whole database (all documents and images) and
   * clears in-memory caches. Resolves once the deletion has completed.
   */
  async clearAll(): Promise<void> {
    for (const url of this.urlCache.values()) URL.revokeObjectURL(url);
    this.urlCache.clear();
    this.dataUrlCache.clear();
    this.blobCache.clear();
    this.metaCache.clear();
    if (!this.isBrowser() || typeof indexedDB === 'undefined') return;

    const db = await this.dbPromise;
    db?.close();
    this.dbPromise = null;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      // Other tabs close their connections via onversionchange; if one cannot,
      // deletion completes as soon as it does, so keep waiting.
      req.onblocked = () => console.warn('Waiting for other Inkframe tabs to release storage…');
    });
  }

  /**
   * Removes a persisted document from IndexedDB and from the localStorage fallback.
   */
  async deleteDocument(key: string): Promise<void> {
    if (!this.isBrowser()) return;
    try {
      const db = await this.getDB();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
          const req = tx.objectStore(DOC_STORE_NAME).delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (e) {
      console.warn('Failed to delete document from IndexedDB:', e);
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // Storage unavailable: there is no fallback copy to remove.
    }
  }

  /**
   * Retrieves a persisted document from IndexedDB asynchronously with localStorage fallback.
   */
  async getDocument<T = unknown>(key: string): Promise<T | null> {
    if (!this.isBrowser()) return null;
    try {
      const db = await this.getDB();
      if (!db) throw new Error('IndexedDB unavailable');
      const result = await new Promise<T | null>((resolve) => {
        const tx = db.transaction(DOC_STORE_NAME, 'readonly');
        const store = tx.objectStore(DOC_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      });
      if (result) return result;
    } catch {
      // IndexedDB unavailable: try the localStorage copy below.
    }

    // Fallback to localStorage (for existing saved docs or fallback)
    try {
      if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(key);
        if (item) return JSON.parse(item) as T;
      }
    } catch {
      // No readable fallback copy.
    }
    return null;
  }
}

export const imageStorage = new ImageStorage();
