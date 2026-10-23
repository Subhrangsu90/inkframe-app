import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageError, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import type { UnsavedDoc } from '../transfer/backup';
import type { DocMeta } from './document-store';

const LAST_BACKUP_KEY = 'inkframe-last-backup';
const REMINDER_CLOSED_KEY = 'inkframe-backup-reminder-closed';
const DAY = 24 * 60 * 60 * 1000;

/** The backup reminder comes back this many days after a backup, or after it was closed. */
export const BACKUP_REMINDER_DAYS = 14;

/**
 * Whether to remind someone to export a backup: they wrote in a document
 * since the last backup, and both that backup (without one, the oldest
 * document they wrote in) and the last closed reminder are
 * BACKUP_REMINDER_DAYS old. Documents nobody wrote in, such as the welcome
 * document, don't count.
 */
export function backupReminderDue(
  docs: readonly DocMeta[],
  lastBackup: number | null,
  reminderClosed: number | null,
  now: number,
): boolean {
  const written = docs.filter((d) => d.updatedAt > d.createdAt && d.updatedAt > (lastBackup ?? 0));
  if (written.length === 0) return false;
  const since = Math.max(
    lastBackup ?? Math.min(...written.map((d) => d.createdAt)),
    reminderClosed ?? 0,
  );
  return now - since >= BACKUP_REMINDER_DAYS * DAY;
}

/** A time remembered in localStorage, or null when there is none. */
export function readTime(key: string): number | null {
  try {
    const time = Number(localStorage.getItem(key));
    return time > 0 ? time : null;
  } catch {
    return null; // no storage (server, private mode): never
  }
}

/** Remembers a time in localStorage, when there is any. */
export function writeTime(key: string, time: number): void {
  try {
    localStorage.setItem(key, String(time));
  } catch {
    // Storage unavailable: remembered until the page is closed, if at all.
  }
}

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
  /**
   * Whether the browser keeps documents even when space runs low (without
   * that, it may delete them to make room). Null until known, or when the
   * browser can't say.
   */
  readonly persisted = signal<boolean | null>(null);
  /** When a backup was last exported on this device, or restored here. */
  readonly lastBackup = signal<number | null>(readTime(LAST_BACKUP_KEY));
  /** When the backup reminder was last closed. */
  readonly reminderClosed = signal<number | null>(readTime(REMINDER_CLOSED_KEY));

  /** What the browser allows when no write is failing. */
  private baseStatus: StorageStatus = 'ok';
  private readonly unsaved = new Map<string, UnsavedDoc>();
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private persistenceAsked = false;

  constructor() {
    if (!this.browser) return;
    const stop = imageStorage.onWrite((result) => {
      if (result.ok) {
        if (this._status() === 'full') this.setStatus(this.baseStatus);
      } else {
        this.setStatus(this.failureStatus(result.error));
      }
    });
    inject(DestroyRef).onDestroy(stop);
    void this.checkMode();
    void this.checkPersisted();
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

  /** Also asks the browser, once a visit, to keep documents (see requestPersistence). */
  markSaved(id: string): void {
    this.unsaved.delete(id);
    void this.requestPersistence();
  }

  /** Records a backup exported now, or restored (made at `time`). */
  recordBackup(time = Date.now()): void {
    if (time <= (this.lastBackup() ?? 0)) return;
    this.lastBackup.set(time);
    writeTime(LAST_BACKUP_KEY, time);
  }

  /** Closes the backup reminder for BACKUP_REMINDER_DAYS. */
  closeBackupReminder(): void {
    const now = Date.now();
    this.reminderClosed.set(now);
    writeTime(REMINDER_CLOSED_KEY, now);
  }

  private async checkPersisted(): Promise<void> {
    try {
      const persisted = await navigator.storage?.persisted?.();
      if (typeof persisted === 'boolean') this.persisted.set(persisted);
    } catch {
      // The browser can't say: stays unknown.
    }
  }

  /**
   * Asks the browser to keep documents even when space runs low, after the
   * first save of a visit, when there is something to keep. Chrome decides
   * by itself (it agrees for installed apps, for one) and may agree on a
   * later visit; Firefox asks the person.
   */
  private async requestPersistence(): Promise<void> {
    if (this.persistenceAsked || this.persisted() || !this.browser) return;
    this.persistenceAsked = true;
    try {
      const granted = await navigator.storage?.persist?.();
      if (typeof granted === 'boolean') this.persisted.set(granted);
    } catch {
      // Not offered here: backups are the safeguard.
    }
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
