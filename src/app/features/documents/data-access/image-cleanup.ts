import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { StorageHealth, readTime, writeTime } from './storage-health';

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
  /** Tasks holding cleanups off (see hold), and when the last of them is done. */
  private holds = 0;
  private released: Promise<void> = Promise.resolve();
  private release?: () => void;

  constructor() {
    if (!this.browser) return;
    // Without storage, every visit sweeps.
    if (Date.now() - (readTime(LAST_SWEEP_KEY) ?? 0) >= SWEEP_EVERY_MS) {
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

  /**
   * Runs `task` with no images deleted meanwhile; a cleanup that comes due
   * waits until it is done. For restoring a backup, which writes images
   * before the documents that show them: until then, nothing does.
   */
  async hold<T>(task: () => Promise<T>): Promise<T> {
    if (this.holds++ === 0) this.released = new Promise((resolve) => (this.release = resolve));
    try {
      return await task();
    } finally {
      if (--this.holds === 0) this.release?.();
    }
  }

  private async run(options: { onlyFrom?: StoredDoc[]; minAgeMs: number }): Promise<number> {
    while (this.holds > 0) await this.released;
    const unsaved = [...this.health.unsavedDocs().values()].map(({ doc }) => doc);
    try {
      return await imageStorage.deleteUnusedImages({ ...options, alsoUsedBy: unsaved });
    } catch (e) {
      console.warn('Unused images could not be deleted:', e);
      return 0;
    }
  }
}
