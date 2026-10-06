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

const underline: MarkSpec = {
  parseDOM: [
    { tag: 'u' },
    { style: 'text-decoration=underline' },
    { style: 'text-decoration-line=underline' },
  ],
  toDOM: () => ['u', 0],
};

const strikethrough: MarkSpec = {
  parseDOM: [
    { tag: 's' },
    { tag: 'del' },
    { tag: 'strike' },
    { style: 'text-decoration=line-through' },
    { style: 'text-decoration-line=line-through' },
  ],
  toDOM: () => ['s', 0],
};

const subscript: MarkSpec = {
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }],
  toDOM: () => ['sub', 0],
};

const superscript: MarkSpec = {
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', 0],
};

const textColor: MarkSpec = {
  attrs: { color: { default: '#000000' } },
  parseDOM: [
    {
      style: 'color',
      getAttrs: (value) => (typeof value === 'string' ? { color: value } : false),
    },
  ],
  toDOM: (mark) => ['span', { style: `color: ${mark.attrs['color']}` }, 0],
};

const small: MarkSpec = {
  parseDOM: [{ tag: 'small' }],
  toDOM: () => ['small', 0],
};

const code: MarkSpec = {
  parseDOM: [{ tag: 'code' }],
  toDOM: () => ['code', 0],
  excludes: '_',
};

const task_list: NodeSpec = {
  group: 'block',
  content: 'task_item+',
  parseDOM: [
    { tag: 'ul.ink-task-list' },
    { tag: 'ul[data-type="task_list"]' },
    { tag: 'ul.contains-task-list' },
  ],
  toDOM: () => ['ul', { class: 'ink-task-list', 'data-type': 'task_list' }, 0],
};

const task_item: NodeSpec = {
  content: 'paragraph block*',
  attrs: {
    checked: { default: false },
  },
  defining: true,
  parseDOM: [
    {
      tag: 'li.ink-task-item',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const checkbox = el.querySelector('input[type="checkbox"]');
        const checked =
          el.getAttribute('data-checked') === 'true' ||
          el.classList.contains('checked') ||
          (checkbox ? (checkbox as HTMLInputElement).checked : false);
        return { checked };
      },
    },
    {
      tag: 'li[data-type="task_item"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const checkbox = el.querySelector('input[type="checkbox"]');
        const checked =
          el.getAttribute('data-checked') === 'true' ||
          el.classList.contains('checked') ||
          (checkbox ? (checkbox as HTMLInputElement).checked : false);
        return { checked };
      },
    },
    {
      tag: 'li.task-list-item',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const checkbox = el.querySelector('input[type="checkbox"]');
        const checked =
          el.getAttribute('data-checked') === 'true' ||
          el.classList.contains('checked') ||
          (checkbox ? (checkbox as HTMLInputElement).checked : false);
        return { checked };
      },
    },
  ],
  toDOM: (node) => [
    'li',
    {
      class: `ink-task-item${node.attrs['checked'] ? ' checked' : ''}`,
      'data-type': 'task_item',
      'data-checked': String(node.attrs['checked']),
    },
    0,
  ],
};

const image: NodeSpec = {
  inline: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
    width: { default: null },
  },
  group: 'inline',
  draggable: true,
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          src: el.getAttribute('src'),
          title: el.getAttribute('title'),
          alt: el.getAttribute('alt'),
          width: el.getAttribute('width') || el.style.width || null,
        };
      },
    },
  ],
  toDOM: (node) => [
    'img',
    {
      src: node.attrs['src'],
      alt: node.attrs['alt'],
      title: node.attrs['title'],
      ...(node.attrs['width']
        ? { width: node.attrs['width'], style: `width: ${node.attrs['width']}` }
        : {}),
    },
  ],
};

const baseNodesWithTasks = base.spec.nodes
  .update('image', image)
  .addToEnd('task_list', task_list)
  .addToEnd('task_item', task_item);

const nodes = addListNodes(baseNodesWithTasks, 'paragraph block*', 'block')
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
  marks: base.spec.marks
    .update('code', code)
    .update('link', link)
    .addToEnd('underline', underline)
    .addToEnd('strikethrough', strikethrough)
    .addToEnd('subscript', subscript)
    .addToEnd('superscript', superscript)
    .addToEnd('textColor', textColor)
    .addToEnd('small', small),
});
