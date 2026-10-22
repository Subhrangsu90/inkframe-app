import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * The public address the app is served from, without a trailing slash, for
 * example 'https://inkframe.app'. Canonical links, og:url and the share image
 * need absolute URLs, so they are left out while this is empty.
 *
 * When you set it, also add these to src/index.html, because link previews of
 * client-rendered pages (documents, shared links) read only that file:
 *   <meta property="og:image" content="SITE_URL/og-image.png" />
 *   <meta name="twitter:image" content="SITE_URL/og-image.png" />
 * and change twitter:card there to summary_large_image.
 */
export const SITE_URL = '';

const SITE_NAME = 'Inkframe';
const DEFAULT_TITLE = 'Inkframe — Private WYSIWYG Document Editor';
const DEFAULT_DESCRIPTION =
  'A full WYSIWYG document editor that runs entirely in your browser. No account, no server: your documents stay on your device.';

/** Per-route metadata, set as `data: { meta: { ... } }` beside the route's `title`. */
export interface PageMetaData {
  /** Plain text for the description and share card. Defaults to the site description. */
  description?: string;
  /** Whether search engines may index the page. Only public pages are; the default is no. */
  index?: boolean;
  /** The page names the tab itself (a document's title) through setPageTitle. */
  ownTitle?: boolean;
}

/** "Settings · Inkframe", or the site title when a page has no title of its own. */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE;
}

/**
 * Sets each page's metadata in one place on every navigation: the title,
 * description, robots and canonical tags, and the Open Graph and Twitter tags
 * that mirror them. Runs while prerendering too, so the landing page, the
 * library and settings ship with their tags in the HTML. src/index.html holds
 * the defaults (including noindex) for pages rendered only in the browser.
 */
@Injectable({ providedIn: 'root' })
export class PageMetaStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(state: RouterStateSnapshot): void {
    let route: ActivatedRouteSnapshot = state.root;
    while (route.firstChild) route = route.firstChild;
    const data: PageMetaData = route.data['meta'] ?? {};

    if (!data.ownTitle) this.setTitleTags(pageTitle(this.buildTitle(state)));
    const description = data.description ?? DEFAULT_DESCRIPTION;
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ name: 'twitter:description', content: description });

    const index = data.index === true;
    if (index) this.meta.removeTag('name="robots"');
    else this.meta.updateTag({ name: 'robots', content: 'noindex' });

    // Without the query or fragment: share links carry the document in the fragment.
    const url = SITE_URL && index ? SITE_URL + state.url.split(/[?#]/)[0] : '';
    this.setCanonical(url);
    if (url) this.meta.updateTag({ property: 'og:url', content: url });
    else this.meta.removeTag('property="og:url"');

    if (SITE_URL) {
      const image = `${SITE_URL}/og-image.png`;
      this.meta.updateTag({ property: 'og:image', content: image });
      this.meta.updateTag({ property: 'og:image:width', content: '1200' });
      this.meta.updateTag({ property: 'og:image:height', content: '630' });
      this.meta.updateTag({ property: 'og:image:alt', content: DEFAULT_TITLE });
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
      this.meta.updateTag({ name: 'twitter:image', content: image });
    }
  }

  /** Names the open page's tab, such as a document's title; pages with `ownTitle` call this. */
  setPageTitle(title: string): void {
    this.setTitleTags(pageTitle(title.trim() || undefined));
  }

  private setTitleTags(title: string): void {
    this.title.setTitle(title);
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ name: 'twitter:title', content: title });
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
