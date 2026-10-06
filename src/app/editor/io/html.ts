import DOMPurify from 'dompurify';
import {
  DOMParser as PMDOMParser,
  DOMSerializer,
  Node as PMNode,
} from 'prosemirror-model';
import { schema } from '../core/schema';

export function docToHtml(doc: PMNode): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
    doc.content,
  );
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

export function htmlToDoc(html: string): PMNode {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const el = document.createElement('div');
  el.innerHTML = clean;
  return PMDOMParser.fromSchema(schema).parse(el);
}
