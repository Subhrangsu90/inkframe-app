import { NodeSpec } from 'prosemirror-model';
import { sanitizeCssLength } from '../../schema/link-utils';

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
        ...(width ? { width, style: `width: ${width}` } : {}),
      },
    ];
  },
};
