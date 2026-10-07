/**
 * IndexedDB storage for images in Inkframe.
 * SSR-safe: handles server environments without errors.
 */

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

const DB_NAME = 'inkframe_storage';
const STORE_NAME = 'images';
const DOC_STORE_NAME = 'documents';
const DB_VERSION = 2;

class ImageStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly urlCache = new Map<string, string>();
  private readonly dataUrlCache = new Map<string, string>();
  private readonly blobCache = new Map<string, Blob>();

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

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        resolve(null);
      };
    });

    return this.dbPromise;
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
  async saveImage(file: File | Blob, name?: string): Promise<{ id: string; uri: string; url: string }> {
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
    this.blobToDataUrl(file).then((dUrl) => {
      if (dUrl) this.dataUrlCache.set(id, dUrl);
    }).catch(() => {});

    const record: ImageRecord = {
      id,
      name: fileName,
      type: file.type || 'image/png',
      size: file.size,
      createdAt: Date.now(),
      blob: file,
    };

    const db = await this.getDB();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    return { id, uri, url: objectUrl };
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
  async optimizeImageBlob(blob: Blob, maxWidth = 960, maxHeight = 960, quality = 0.72): Promise<string> {
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
        try { URL.revokeObjectURL(url); } catch {}
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

    const srcRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*>/gi;
    const matches: Array<{ fullTag: string; rawSrc: string }> = [];
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
  async inlineDocImages<T = any>(storedDoc: T, forShare = false): Promise<T> {
    if (!storedDoc || typeof storedDoc !== 'object') return storedDoc;
    const clone = JSON.parse(JSON.stringify(storedDoc));

    const traverse = async (node: any): Promise<void> => {
      if (!node) return;
      if (node.type === 'image' && node.attrs && typeof node.attrs.src === 'string') {
        const src = node.attrs.src;
        if (src.startsWith('ink-idb:') || src.startsWith('blob:') || (forShare && src.startsWith('data:'))) {
          const dataUrl = await this.resolveToDataUrl(src, forShare);
          if (dataUrl && dataUrl.startsWith('data:')) {
            node.attrs.src = dataUrl;
          }
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          await traverse(child);
        }
      }
    };

    const docRoot = (clone as any).doc || clone;
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

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persists a document to IndexedDB asynchronously without blocking the UI thread.
   * Includes fallback to localStorage if IndexedDB is inaccessible.
   */
  async saveDocument<T = any>(key: string, doc: T): Promise<void> {
    if (!this.isBrowser()) return;
    try {
      const db = await this.getDB();
      if (!db) throw new Error('IndexedDB unavailable');
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DOC_STORE_NAME);
        const req = store.put(doc, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to save to IndexedDB, fallback to localStorage:', e);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(doc));
        }
      } catch {}
    }
  }

  /**
   * Retrieves a persisted document from IndexedDB asynchronously with localStorage fallback.
   */
  async getDocument<T = any>(key: string): Promise<T | null> {
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
    } catch {}

    // Fallback to localStorage (for existing saved docs or fallback)
    try {
      if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(key);
        if (item) return JSON.parse(item) as T;
      }
    } catch {}
    return null;
  }
}

export const imageStorage = new ImageStorage();
