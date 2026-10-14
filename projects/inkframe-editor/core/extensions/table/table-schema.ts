import { tableNodes } from 'prosemirror-tables';
import { sanitizeCssColor } from '../../schema/link-utils';

/**
 * Table, row and cell specs, with alignment and background cell attributes.
 * Rows have no fixed height: they fit their text.
 */
export const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    alignment: {
      default: null,
      getFromDOM(dom) {
        const value = (dom as HTMLElement).style.textAlign;
        return value === 'left' || value === 'center' || value === 'right' ? value : null;
      },
      setDOMAttr(value, attrs) {
        if (value === 'left' || value === 'center' || value === 'right') {
          attrs['style'] = (attrs['style'] || '') + `text-align: ${value};`;
        }
      },
    },
    background: {
      default: null,
      getFromDOM(dom) {
        return sanitizeCssColor((dom as HTMLElement).style.backgroundColor);
      },
      setDOMAttr(value, attrs) {
        const color = sanitizeCssColor(value);
        if (color) {
          attrs['style'] = (attrs['style'] || '') + `background-color: ${color};`;
        }
      },
    },
  },
});
