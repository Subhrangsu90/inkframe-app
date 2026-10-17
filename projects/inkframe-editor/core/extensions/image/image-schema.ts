import { NodeSpec } from 'prosemirror-model';
import { sanitizeCssLength } from '../../schema/sanitize-css';

export const image: NodeSpec = {
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
          width: sanitizeCssLength(el.getAttribute('width') || el.style.width),
        };
      },
    },
  ],
  toDOM: (node) => {
    const width = sanitizeCssLength(node.attrs['width']);
    return [
      'img',
      {
        src: node.attrs['src'],
        alt: node.attrs['alt'],
        title: node.attrs['title'],
        class: 'ink-image',
        // Long documents decode only the images near the screen. Printing
        // loads them all first (doc-export.ts printDocument).
        loading: 'lazy',
        decoding: 'async',
        ...(width ? { width, style: `width: ${width}` } : {}),
      },
    ];
  },
};
