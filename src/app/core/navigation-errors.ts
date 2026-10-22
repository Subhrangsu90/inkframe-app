import { DOCUMENT, inject } from '@angular/core';
import { NavigationError } from '@angular/router';
import { ToastService } from '@app/shared/ui/toast/toast';

/** How Chrome, Safari and Firefox report a lazily loaded file that failed to download. */
const LOAD_FAILED =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/**
 * Tells the person when a page's code could not be downloaded, instead of
 * the link doing nothing: they are offline before the app was saved for
 * offline use, the connection dropped, or a new version replaced the files.
 * Reloading is the fix: browsers keep a failed download's error for the
 * rest of the visit. Other navigation errors are left to the router.
 * (Runs in the router's injection context: `withNavigationErrorHandler`.)
 */
export function handleNavigationError(error: NavigationError): void {
  const cause = error.error as { message?: unknown } | null;
  if (!LOAD_FAILED.test(String(cause?.message ?? cause))) return;
  const doc = inject(DOCUMENT);
  const offline = doc.defaultView?.navigator.onLine === false;
  inject(ToastService).error(
    offline
      ? "You're offline, and this page isn't saved for offline use yet. Reload once you're back online."
      : 'This page could not be loaded. Reload to try again.',
    0,
    { label: 'Reload', onClick: () => doc.location.assign(error.url) },
  );
}
