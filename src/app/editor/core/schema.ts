import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';
import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';
import { sanitizeHref } from './link-utils';

export type CalloutKind = 'info' | 'warning' | 'success' | 'danger';
export const CALLOUT_KINDS: CalloutKind[] = ['info', 'warning', 'success', 'danger'];

// addListNodes() needs an OrderedMap (it calls .append()), not a plain object,
// so build a base schema first and use its spec.
const base = new Schema({ nodes: basicNodes, marks: basicMarks });

const callout: NodeSpec = {
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { type: { default: 'info' } },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      getAttrs: (d) => {
        const kind = (d as HTMLElement).dataset['callout'] as CalloutKind;
        return { type: CALLOUT_KINDS.includes(kind) ? kind : 'info' };
      },
      contentElement: '.callout-body',
    },
  ],
  toDOM: (n) => [
    'div',
    {
      'data-callout': n.attrs['type'],
      class: `callout callout-${n.attrs['type']}`,
    },
    ['div', { class: 'callout-body' }, 0],
  ],
};

const link: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const href = sanitizeHref(el.getAttribute('href'));
        return href ? { href, title: el.getAttribute('title') } : false; // false = drop the mark
      },
    },
  ],
  toDOM: (mark) => [
    'a',
    {
      href: sanitizeHref(mark.attrs['href']) ?? '#',
      title: mark.attrs['title'],
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    },
    0,
  ],
};

const nodes = addListNodes(base.spec.nodes, 'paragraph block*', 'block')
  .append(
    tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {},
    }),
  )
  .addToEnd('callout', callout);

export const schema = new Schema({
  nodes,
  marks: base.spec.marks.update('link', link),
});
