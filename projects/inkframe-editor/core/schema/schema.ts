import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';
import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { sanitizeCssColor, sanitizeHref } from './link-utils';
import { tableNodeSpecs } from '../extensions/table/table-schema';
import { callout } from '../extensions/callout/callout-schema';
import { code_block } from '../extensions/code-block/code-block-schema';
import { image } from '../extensions/image/image-schema';
import {
  LIST_LEAD_GROUP,
  bullet_list,
  list_item,
  ordered_list,
  task_item,
  task_list,
} from '../extensions/lists/list-schema';

/** Paragraph and heading alignment. `left` is stored as `null` (the default). */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export const TEXT_ALIGNMENTS: TextAlign[] = ['left', 'center', 'right', 'justify'];

/** Returns the alignment if it is one the schema stores (center, right, justify), otherwise null. */
export function sanitizeTextAlign(raw: unknown): Exclude<TextAlign, 'left'> | null {
  return raw === 'center' || raw === 'right' || raw === 'justify' ? raw : null;
}

function readTextAlign(dom: HTMLElement): Exclude<TextAlign, 'left'> | null {
  // The raw attribute too: not every CSS engine accepts `-webkit-center`.
  const raw = /text-align\s*:\s*([-\w]+)/i.exec(dom.getAttribute('style') ?? '')?.[1];
  const value = (dom.style.textAlign || raw || dom.getAttribute('align') || '')
    .trim()
    .toLowerCase();
  return sanitizeTextAlign(value === '-webkit-center' ? 'center' : value);
}

// The value is checked against the allow-list: shared documents can carry any attribute value.
const textAlignAttrs = (raw: unknown) => {
  const align = sanitizeTextAlign(raw);
  return align ? { style: `text-align: ${align}` } : {};
};

/** The highlight color used when none is chosen (also for `<mark>` and `==text==` without a color). */
export const DEFAULT_HIGHLIGHT_COLOR = '#fef08a';

const NO_HIGHLIGHT = /^(transparent|none|inherit|initial|unset|revert|currentcolor|window)$/i;
// rgba(0, 0, 0, 0), hsla(0 0% 0% / 0%), ...: fully transparent.
const ZERO_ALPHA = /^(?:rgb|hsl)a?\((?:[^,]+,){3}\s*0*(?:\.0+)?%?\s*\)$|\/\s*0*(?:\.0+)?%?\s*\)$/i;

/** A CSS color usable as a highlight, or null for unsafe values and keywords that mean "no background". */
export function sanitizeHighlightColor(raw: unknown): string | null {
  const color = sanitizeCssColor(raw);
  return color && !NO_HIGHLIGHT.test(color) && !ZERO_ALPHA.test(color) ? color : null;
}

// Built only for its OrderedMap of node and mark specs, which the schema below extends.
const base = new Schema({ nodes: basicNodes, marks: basicMarks });

// Paragraphs and headings can start a list item (the list_lead group).
const paragraph: NodeSpec = {
  ...basicNodes.paragraph,
  group: `block ${LIST_LEAD_GROUP}`,
  attrs: { align: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: readTextAlign(dom as HTMLElement) }) }],
  toDOM: (node) => ['p', textAlignAttrs(node.attrs['align']), 0],
};

const heading: NodeSpec = {
  ...basicNodes.heading,
  group: `block ${LIST_LEAD_GROUP}`,
  attrs: { level: { default: 1, validate: 'number' }, align: { default: null } },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, align: readTextAlign(dom) }),
  })),
  toDOM: (node) => [`h${node.attrs['level']}`, textAlignAttrs(node.attrs['align']), 0],
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

// Google Docs writes sub- and superscript as `vertical-align` styles.
const subscript: MarkSpec = {
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
  toDOM: () => ['sub', 0],
};

const superscript: MarkSpec = {
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
  toDOM: () => ['sup', 0],
};

const textColor: MarkSpec = {
  attrs: { color: { default: '#000000' } },
  parseDOM: [
    {
      style: 'color',
      getAttrs: (value) => {
        const color = sanitizeCssColor(value);
        return color ? { color } : false;
      },
    },
  ],
  toDOM: (mark) => {
    const color = sanitizeCssColor(mark.attrs['color']);
    return ['span', color ? { style: `color: ${color}` } : {}, 0];
  },
};

const small: MarkSpec = {
  parseDOM: [{ tag: 'small' }],
  toDOM: () => ['small', 0],
};

const highlight: MarkSpec = {
  attrs: { color: { default: DEFAULT_HIGHLIGHT_COLOR } },
  parseDOM: [
    {
      tag: 'mark',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const color =
          sanitizeHighlightColor(el.getAttribute('data-color')) ??
          sanitizeHighlightColor(el.style.backgroundColor);
        return color ? { color } : {};
      },
    },
    {
      // A tag rule rather than a `background-color` style rule, which would
      // also turn table cell backgrounds into highlights on the cell's text.
      tag: 'span',
      consuming: false,
      getAttrs: (dom) => {
        const color = sanitizeHighlightColor((dom as HTMLElement).style.backgroundColor);
        return color ? { color } : false;
      },
    },
  ],
  toDOM: (mark) => {
    const color = sanitizeHighlightColor(mark.attrs['color']) ?? DEFAULT_HIGHLIGHT_COLOR;
    return ['mark', { 'data-color': color, style: `background-color: ${color}` }, 0];
  },
};

const code: MarkSpec = {
  parseDOM: [{ tag: 'code' }],
  toDOM: () => ['code', 0],
  excludes: '_',
};

const nodes = base.spec.nodes
  .update('paragraph', paragraph)
  .update('heading', heading)
  .update('image', image)
  .update('code_block', code_block)
  .addToEnd('task_list', task_list)
  .addToEnd('task_item', task_item)
  .addToEnd('ordered_list', ordered_list)
  .addToEnd('bullet_list', bullet_list)
  .addToEnd('list_item', list_item)
  .append(tableNodeSpecs)
  .addToEnd('callout', callout);

export {
  paragraph,
  heading,
  link,
  underline,
  strikethrough,
  subscript,
  superscript,
  textColor,
  small,
  highlight,
  code,
  base,
  nodes,
};

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
    .addToEnd('small', small)
    .addToEnd('highlight', highlight),
});
