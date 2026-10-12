import DOMPurify from 'dompurify';
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema';

import { highlightCodeInHtml } from '../highlight.plugin';

export const DOMPURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_DATA_URI_TAGS: ['img'],
  // DOMPurify also tests this against the value of every attribute that is not
  // URI-safe (rel, target, width, colspan, ...). Besides the allowed schemes it
  // must therefore accept values that have no scheme at all, as DOMPurify's
  // default does. `data:` stays limited to <img> via ADD_DATA_URI_TAGS.
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|blob|ink-idb):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Sanitizes HTML for display, e.g. HTML rendered from a document received
 * through a share link. Keeps the editor's classes, data attributes, inline
 * styles and link targets; strips scripts, event handlers and unsafe URLs.
 */
export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return '';
  return DOMPurify.sanitize(html, { ...DOMPURIFY_CONFIG, ADD_ATTR: ['target'] });
}

export function docToHtml(doc: PMNode, options?: { highlightCode?: boolean }): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  const rawHtml = div.innerHTML;
  if (options?.highlightCode === false) {
    return rawHtml;
  }
  return highlightCodeInHtml(rawHtml);
}

export function htmlToDoc(html: string): PMNode {
  if (typeof document === 'undefined') {
    return schema.node('doc', null, [schema.node('paragraph')]);
  }
  const clean = DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
  const el = document.createElement('div');
  el.innerHTML = clean;
  return PMDOMParser.fromSchema(schema).parse(el);
}
