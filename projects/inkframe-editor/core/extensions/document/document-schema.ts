import { NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { LIST_LEAD_GROUP } from '../lists/list-schema';
import {
  blockFormatAttrSpecs,
  blockFormatDomAttrs,
  readBlockFormat,
} from '../paragraph-format/paragraph-format-schema';

/**
 * The top node. `page` holds the document's page setup (see
 * `normalizePageSetup`); null means Pageless with the default margins.
 */
export const doc: NodeSpec = {
  ...basicNodes.doc,
  attrs: { page: { default: null } },
};

// Paragraphs and headings can start a list item (the list_lead group).
export const paragraph: NodeSpec = {
  ...basicNodes.paragraph,
  group: `block ${LIST_LEAD_GROUP}`,
  attrs: blockFormatAttrSpecs(),
  parseDOM: [{ tag: 'p', getAttrs: (dom) => readBlockFormat(dom as HTMLElement) }],
  toDOM: (node) => ['p', blockFormatDomAttrs(node.attrs), 0],
};
