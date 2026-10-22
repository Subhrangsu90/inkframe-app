/**
 * The editor URL of a document, for `routerLink` and `Router.navigateByUrl`.
 * A string, not a command array: templates can call it without giving
 * `routerLink` a new array on every change detection.
 */
export function docPath(id: string): string {
  return `/doc/${encodeURIComponent(id)}`;
}
