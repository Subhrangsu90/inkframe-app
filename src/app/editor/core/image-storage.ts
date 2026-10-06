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
const DB_VERSION = 1;

class ImageStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private readonly urlCache = new Map<string, string>();

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  }

  private getDB(): Promise<IDBDatabase | null> {
    if (!this.isBrowser()) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
   * Saves an image file or blob to IndexedDB and returns a stable custom URI
   * with format: ink-idb:<id> and a temporary preview object URL.
   */
  async saveImage(file: File | Blob, name?: string): Promise<{ id: string; uri: string; url: string }> {
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fileName = name || (file instanceof File ? file.name : 'image.png');
    const uri = `ink-idb:${id}`;

    if (!this.isBrowser()) {
      return { id, uri, url: '' };
    }

    const objectUrl = URL.createObjectURL(file);
    this.urlCache.set(id, objectUrl);

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
   * Resolves any src string to a displayable URL (converts ink-idb: into blob URL).
   */
  async resolveUrl(src: string): Promise<string> {
    if (!src) return '';
    if (!src.startsWith('ink-idb:')) return src;

    const id = src.slice('ink-idb:'.length);
    const cached = this.urlCache.get(id);
    if (cached) return cached;

    const blob = await this.getImageBlob(id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      this.urlCache.set(id, url);
      return url;
    }

    return src;
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

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const imageStorage = new ImageStorage();
