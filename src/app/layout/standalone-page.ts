import { ActivatedRouteSnapshot, Data } from '@angular/router';

/** Route `data` for a page shown without the app shell (sidebar and header). */
export const STANDALONE_PAGE: Data = { standalone: true };

/** Whether the page a router state leads to is shown without the app shell. */
export function isStandalonePage(root: ActivatedRouteSnapshot): boolean {
  let route = root;
  while (route.firstChild) route = route.firstChild;
  return route.data['standalone'] === true;
}
