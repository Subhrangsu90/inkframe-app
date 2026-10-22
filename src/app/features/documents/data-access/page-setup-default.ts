import { Injectable, signal } from '@angular/core';
import { DocJSON, PageSetup, StoredDoc, normalizePageSetup } from '@inkframe-ui/editor/core';

const STORAGE_KEY = 'inkframe-page-setup';

/** The page setup saved with "Set as default" in the Page setup dialog, or null. */
export function readDefaultPageSetup(): PageSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePageSetup(JSON.parse(raw)) : null;
  } catch {
    return null; // no storage (server, private mode) or a damaged value
  }
}

/**
 * The document with the saved default page setup, unless it has a page
 * setup of its own or no default was saved.
 */
export function withDefaultPageSetup(stored: StoredDoc): StoredDoc {
  const setup = readDefaultPageSetup();
  const doc = stored.doc as DocJSON | null;
  if (!setup || !doc || doc.attrs?.['page'] != null) return stored;
  return { ...stored, doc: { ...doc, attrs: { ...doc.attrs, page: setup } } };
}

/** The default page setup for new documents, as `<ink-editor [defaultPageSetup]>` shows it. */
@Injectable({ providedIn: 'root' })
export class PageSetupDefaults {
  readonly value = signal<PageSetup | null>(readDefaultPageSetup());

  save(setup: PageSetup | null): void {
    this.value.set(setup);
    try {
      if (setup) localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the default lasts until the page is closed.
    }
  }
}
