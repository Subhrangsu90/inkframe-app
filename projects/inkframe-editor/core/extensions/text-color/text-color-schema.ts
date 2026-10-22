import { MarkSpec } from 'prosemirror-model';
import { sanitizeCssColor } from '../../schema/sanitize-css';

export const textColor: MarkSpec = {
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
