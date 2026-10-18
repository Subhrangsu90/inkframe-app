import { Injectable, signal } from '@angular/core';

const RULER_KEY = 'inkframe-show-ruler';

function readShowRuler(): boolean {
  try {
    return localStorage.getItem(RULER_KEY) !== 'false';
  } catch {
    return true; // no storage (server, private mode): the default
  }
}

/** How the editor looks for this person, on this device (not stored in documents). */
@Injectable({ providedIn: 'root' })
export class EditorPreferences {
  /** The ruler above the page. On unless turned off in Settings. */
  readonly showRuler = signal(readShowRuler());

  setShowRuler(show: boolean): void {
    this.showRuler.set(show);
    try {
      if (show) localStorage.removeItem(RULER_KEY);
      else localStorage.setItem(RULER_KEY, 'false');
    } catch {
      // Storage unavailable: the choice lasts until the page is closed.
    }
  }
}
