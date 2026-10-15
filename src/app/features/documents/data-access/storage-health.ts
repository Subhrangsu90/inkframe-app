import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageError, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import type { UnsavedDoc } from '../transfer/backup';

/**
 * - `ok`: documents and images are saved.
 * - `full`: the last write failed because storage is full.
 * - `limited`: IndexedDB is blocked; documents go to localStorage, images are not kept.
 * - `unavailable`: the browser blocks storage; nothing can be saved.
 */
export type StorageStatus = 'ok' | 'full' | 'limited' | 'unavailable';

/** Watches whether this browser can save documents, for the storage banners. */
@Injectable({ providedIn: 'root' })
export class StorageHealth {
  private readonly _status = signal<StorageStatus>('ok');
  readonly status = this._status.asReadonly();
  /** The person closed the banner; it returns when the status changes. */
  readonly dismissed = signal(false);

  /** What the browser allows when no write is failing. */
  private baseStatus: StorageStatus = 'ok';
  private readonly unsaved = new Map<string, UnsavedDoc>();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const stop = imageStorage.onWrite((result) => {
      if (result.ok) {
        if (this._status() === 'full') this.setStatus(this.baseStatus);
      } else {
        this.setStatus(this.failureStatus(result.error));
      }
    });
    inject(DestroyRef).onDestroy(stop);
    void this.checkMode();
  }

  /** Reads which storage the browser allows (see StorageMode). */
  async checkMode(): Promise<void> {
    const mode = await imageStorage.storageMode();
    this.baseStatus = mode === 'indexeddb' ? 'ok' : mode === 'local' ? 'limited' : 'unavailable';
    if (this._status() !== 'full') this.setStatus(this.baseStatus);
  }

  /** Remembers a document whose latest edits storage refused, so backups include them. */
  markUnsaved(id: string, title: string, doc: StoredDoc): void {
    this.unsaved.set(id, { title, doc });
  }

  markSaved(id: string): void {
    this.unsaved.delete(id);
  }

  unsavedDocs(): ReadonlyMap<string, UnsavedDoc> {
    return this.unsaved;
  }

  private failureStatus(error: StorageError): StorageStatus {
    if (error.reason === 'quota') return 'full';
    return this.baseStatus === 'ok' ? 'unavailable' : this.baseStatus;
  }

  private setStatus(status: StorageStatus): void {
    if (status === this._status()) return;
    this._status.set(status);
    this.dismissed.set(false);
  }
}
