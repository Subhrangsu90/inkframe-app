import { Attrs, Node as PMNode, NodeSpec } from 'prosemirror-model';
import { sanitizeCssColor } from '../../schema/sanitize-css';

/*
 * The table, row and cell specs, built the way prosemirror-tables'
 * `tableNodes()` builds them (MIT; a test checks they stay the same). Built
 * here so that showing a document, in the reader or for printing, doesn't
 * load prosemirror-tables and the editor's view code with it: only editing
 * tables needs those.
 */

/** A cell attribute besides the spans and column widths, read from and written to the DOM. */
interface CellAttribute {
  default: unknown;
  getFromDOM(dom: HTMLElement): unknown;
  setDOMAttr(value: unknown, attrs: Record<string, string>): void;
}

/** Alignment and background colour of table cells. */
const cellAttributes: Record<string, CellAttribute> = {
  alignment: {
    default: null,
    getFromDOM(dom) {
      const value = dom.style.textAlign;
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
      return sanitizeCssColor(dom.style.backgroundColor);
    },
    setDOMAttr(value, attrs) {
      const color = sanitizeCssColor(value);
      if (color) {
        attrs['style'] = (attrs['style'] || '') + `background-color: ${color};`;
      }
    },
  },
};

function getCellAttrs(dom: HTMLElement | string): Attrs {
  if (typeof dom === 'string') return {};
  const widthAttr = dom.getAttribute('data-colwidth');
  const widths =
    widthAttr && /^\d+(,\d+)*$/.test(widthAttr) ? widthAttr.split(',').map((s) => Number(s)) : null;
  const colspan = Number(dom.getAttribute('colspan') || 1);
  const result: Record<string, unknown> = {
    colspan,
    rowspan: Number(dom.getAttribute('rowspan') || 1),
    colwidth: widths && widths.length == colspan ? widths : null,
  };
  for (const [name, attribute] of Object.entries(cellAttributes)) {
    const value = attribute.getFromDOM(dom);
    if (value != null) result[name] = value;
  }
  return result;
}

function setCellAttrs(node: PMNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (node.attrs['colspan'] != 1) attrs['colspan'] = node.attrs['colspan'];
  if (node.attrs['rowspan'] != 1) attrs['rowspan'] = node.attrs['rowspan'];
  if (node.attrs['colwidth']) attrs['data-colwidth'] = node.attrs['colwidth'].join(',');
  for (const [name, attribute] of Object.entries(cellAttributes)) {
    attribute.setDOMAttr(node.attrs[name], attrs);
  }
  return attrs;
}

function validateColwidth(value: unknown): void {
  if (value === null) return;
  if (!Array.isArray(value)) throw new TypeError('colwidth must be null or an array');
  for (const item of value) {
    if (typeof item !== 'number') {
      throw new TypeError('colwidth must be null or an array of numbers');
    }
  }
}

const cellAttrs: NodeSpec['attrs'] = {
  colspan: { default: 1, validate: 'number' },
  rowspan: { default: 1, validate: 'number' },
  colwidth: { default: null, validate: validateColwidth },
  ...Object.fromEntries(
    Object.entries(cellAttributes).map(([name, attribute]) => [
      name,
      { default: attribute.default },
    ]),
  ),
};

const cell = (tag: 'td' | 'th', tableRole: 'cell' | 'header_cell'): NodeSpec => ({
  content: 'block+',
  attrs: cellAttrs,
  tableRole,
  isolating: true,
  parseDOM: [{ tag, getAttrs: (dom: HTMLElement | string) => getCellAttrs(dom) }],
  toDOM: (node) => [tag, setCellAttrs(node), 0],
});

/**
 * Table, row and cell specs, with alignment and background cell attributes.
 * Rows have no fixed height: they fit their text.
 */
export const tableNodeSpecs: Record<
  'table' | 'table_row' | 'table_cell' | 'table_header',
  NodeSpec
> = {
  table: {
    content: 'table_row+',
    tableRole: 'table',
    isolating: true,
    group: 'block',
    parseDOM: [{ tag: 'table' }],
    toDOM: () => ['table', ['tbody', 0]],
  },
  table_row: {
    content: '(table_cell | table_header)*',
    tableRole: 'row',
    parseDOM: [{ tag: 'tr' }],
    toDOM: () => ['tr', 0],
  },
  table_cell: cell('td', 'cell'),
  table_header: cell('th', 'header_cell'),
};
