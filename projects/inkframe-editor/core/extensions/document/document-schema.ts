import { NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { LIST_LEAD_GROUP } from '../lists/list-schema';
import { readTextAlign, textAlignAttrs } from '../text-align/text-align-schema';

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
  attrs: { align: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: readTextAlign(dom as HTMLElement) }) }],
  toDOM: (node) => ['p', textAlignAttrs(node.attrs['align']), 0],
};
