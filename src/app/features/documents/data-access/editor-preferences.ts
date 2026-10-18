import { Injectable, signal } from '@angular/core';
import { PageZoom, normalizeZoom } from '@inkframe-ui/editor/core';

const RULER_KEY = 'inkframe-show-ruler';
const ZOOM_KEY = 'inkframe-zoom';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // no storage (server, private mode): the default
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts until the page is closed.
  }
}

/** Reads a saved zoom: `fit`, `auto` or a scale such as `1.25`. */
function readZoom(): PageZoom {
  const raw = read(ZOOM_KEY);
  return normalizeZoom(raw === 'fit' || raw === 'auto' ? raw : raw === null ? null : Number(raw));
}

/** How the editor looks for this person, on this device (not stored in documents). */
@Injectable({ providedIn: 'root' })
export class EditorPreferences {
  /** The ruler above the page. On unless turned off in Settings. */
  readonly showRuler = signal(read(RULER_KEY) !== 'false');
  /** The zoom for Pages layout, chosen in the editor's status bar. */
  readonly zoom = signal<PageZoom>(readZoom());

  setShowRuler(show: boolean): void {
    this.showRuler.set(show);
    write(RULER_KEY, show ? null : 'false');
  }

  setZoom(zoom: PageZoom): void {
    const value = normalizeZoom(zoom);
    this.zoom.set(value);
    write(ZOOM_KEY, value === 'auto' ? null : String(value));
  }
}
