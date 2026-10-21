import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * A change to the library, as told to the app's other tabs:
 * - `saved`: these documents' content was saved, new documents included.
 *   With no ids, only entries changed (their previews).
 * - `deleted`: these documents were deleted.
 * - `cleared`: every document was deleted.
 */
export type LibraryChange =
  { type: 'saved'; ids: string[] } | { type: 'deleted'; ids: string[] } | { type: 'cleared' };

const CHANNEL_NAME = 'inkframe-library';

/** Messages can come from an older or newer version of the app in another tab. */
function isLibraryChange(data: unknown): data is LibraryChange {
  const change = data as { type?: unknown; ids?: unknown } | null;
  if (change?.type === 'cleared') return true;
  return (
    (change?.type === 'saved' || change?.type === 'deleted') &&
    Array.isArray(change.ids) &&
    change.ids.every((id) => typeof id === 'string')
  );
}

/**
 * Tells the app's other tabs and windows when documents change, so their
 * lists stay current and a document open there shows the latest text. A tab
 * does not hear its own changes. Without BroadcastChannel, and on the
 * server, nothing is sent.
 */
@Injectable({ providedIn: 'root' })
export class DocumentChannel {
  private readonly channel =
    isPlatformBrowser(inject(PLATFORM_ID)) && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  private readonly listeners = new Set<(change: LibraryChange) => void>();

  constructor() {
    const channel = this.channel;
    if (!channel) return;
    channel.onmessage = ({ data }: MessageEvent) => {
      if (!isLibraryChange(data)) return;
      for (const listener of this.listeners) listener(data);
    };
    inject(DestroyRef).onDestroy(() => channel.close());
  }

  post(change: LibraryChange): void {
    try {
      this.channel?.postMessage(change);
    } catch {
      // Closed: the app is shutting down, so there is nobody to tell.
    }
  }

  /** Calls `listener` with every change other tabs make. Returns a function that stops it. */
  listen(listener: (change: LibraryChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
