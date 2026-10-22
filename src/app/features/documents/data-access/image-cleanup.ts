import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { StorageHealth } from './storage-health';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LAST_SWEEP_KEY = 'inkframe-image-sweep';
/** After a document is deleted: time enough for other documents' last edits to be saved. */
const AFTER_DELETING_MS = 15_000;
/** The whole library is swept at most this often, a minute after the app starts. */
const SWEEP_EVERY_MS = 7 * DAY;
const SWEEP_AFTER_START_MS = 60_000;

/**
 * Deletes stored images nothing shows any more (see
 * `imageStorage.deleteUnusedImages`), so storage does not fill up with
 * images removed from documents: a deleted document's images shortly
 * after, and others in a weekly sweep. Images that a version or an edit
 * storage refused still shows are kept, and so are new ones.
 */
@Injectable({ providedIn: 'root' })
export class ImageCleanup {
  private readonly health = inject(StorageHealth);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private deleted: StoredDoc[] = [];
  private afterDeletingTimer?: ReturnType<typeof setTimeout>;
  private sweepTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!this.browser) return;
    if (Date.now() - readTime(LAST_SWEEP_KEY) >= SWEEP_EVERY_MS) {
      this.sweepTimer = setTimeout(() => void this.sweep(), SWEEP_AFTER_START_MS);
    }
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.sweepTimer);
      clearTimeout(this.afterDeletingTimer);
    });
  }

  /** A document was deleted: its images go shortly after, unless something else shows them. */
  afterDeleting(doc: StoredDoc): void {
    if (!this.browser) return;
    this.deleted.push(doc);
    clearTimeout(this.afterDeletingTimer);
    this.afterDeletingTimer = setTimeout(() => {
      const onlyFrom = this.deleted;
      this.deleted = [];
      // An hour: an edit not saved yet (in another tab, say) may have a copy of an image.
      void this.run({ onlyFrom, minAgeMs: HOUR });
    }, AFTER_DELETING_MS);
  }

  /** Deletes every image nothing shows that was added over a day ago. Resolves to how many. */
  sweep(): Promise<number> {
    writeTime(LAST_SWEEP_KEY, Date.now());
    return this.run({ minAgeMs: DAY });
  }

  private async run(options: { onlyFrom?: StoredDoc[]; minAgeMs: number }): Promise<number> {
    const unsaved = [...this.health.unsavedDocs().values()].map(({ doc }) => doc);
    try {
      return await imageStorage.deleteUnusedImages({ ...options, alsoUsedBy: unsaved });
    } catch (e) {
      console.warn('Unused images could not be deleted:', e);
      return 0;
    }
  }
}

function readTime(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeTime(key: string, time: number): void {
  try {
    localStorage.setItem(key, String(time));
  } catch {
    // Storage unavailable: the next visit sweeps again.
  }
}
