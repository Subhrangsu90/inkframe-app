import { Injectable, InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Whether this tab may edit a document, or another tab is editing it. */
export type EditAccess = 'edit' | 'elsewhere';

/** This tab's claim on an open document (see EditLocks). */
export interface EditLock {
  /** Takes the document over from the tab editing it ("Edit here"). */
  takeOver(): void;
  /** Lets other tabs edit the document. Call once this tab's edits are saved. */
  release(): void;
}

/** The browser's Web Locks; null without them and on the server. Tests provide their own. */
export const LOCK_MANAGER = new InjectionToken<LockManager | null>('LockManager', {
  providedIn: 'root',
  factory: () =>
    isPlatformBrowser(inject(PLATFORM_ID)) && typeof navigator !== 'undefined'
      ? (navigator.locks ?? null)
      : null,
});

/**
 * One tab at a time edits a document, so two tabs or windows never save
 * over each other's edits. The tab that opens a document holds a Web Lock
 * named after it. Other tabs show the document read-only until the lock is
 * free, which they then take on their own, or until they take it over
 * ("Edit here"). Without Web Locks every tab edits, as before.
 */
@Injectable({ providedIn: 'root' })
export class EditLocks {
  private readonly locks = inject(LOCK_MANAGER);

  /**
   * Opens a document for editing. `onAccess` hears whether this tab may edit
   * it: once before the returned promise resolves, then whenever that
   * changes (another tab takes it over or lets it go), until release().
   */
  async open(docId: string, onAccess: (access: EditAccess) => void): Promise<EditLock> {
    const locks = this.locks;
    if (!locks) {
      onAccess('edit');
      return { takeOver: () => undefined, release: () => undefined };
    }
    const name = `inkframe-doc:${docId}`;
    let released = false;
    /** Lets go of the lock while this tab holds it. */
    let letGo: (() => void) | null = null;
    /** Calls off the request waiting for the lock, while there is one. */
    let waiting: AbortController | null = null;
    let known: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (known = resolve));
    const tell = (access: EditAccess) => {
      onAccess(access);
      known();
    };

    const request = (options: LockOptions): void => {
      let granted = false;
      locks
        .request(name, options, (lock) => {
          if (!lock) return wait(); // another tab holds it
          granted = true;
          if (released) return; // closed meanwhile: let go at once
          // A takeover no longer needs to wait.
          if (waiting && waiting.signal !== options.signal) waiting.abort();
          waiting = null;
          tell('edit');
          return new Promise<void>((resolve) => (letGo = resolve));
        })
        .catch((e: unknown) => {
          if (released) return;
          if (granted) {
            // Another tab took it over: wait to get it back.
            letGo = null;
            wait();
          } else if ((e as { name?: unknown } | null)?.name !== 'AbortError') {
            // The browser refuses locks here (a sandboxed frame, say): edit, as without them.
            tell('edit');
          }
        });
    };
    const wait = (): void => {
      if (released) return;
      tell('elsewhere');
      waiting = new AbortController();
      request({ signal: waiting.signal });
    };

    request({ ifAvailable: true });
    await ready;
    return {
      takeOver: () => {
        if (released || letGo) return;
        waiting?.abort();
        waiting = null;
        request({ steal: true });
      },
      release: () => {
        released = true;
        waiting?.abort();
        letGo?.();
      },
    };
  }
}
