import DOMPurify from 'dompurify';
import {
  DOMParser as PMDOMParser,
  DOMSerializer,
  Node as PMNode,
} from 'prosemirror-model';
import { schema } from '../schema';

import { highlightCodeInHtml } from '../highlight.plugin';

export const DOMPURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_DATA_URI_TAGS: ['img'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|blob|ink-idb):|data:image\/)/i,
};

export function docToHtml(
  doc: PMNode,
  options?: { highlightCode?: boolean },
): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
    doc.content,
  );
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
