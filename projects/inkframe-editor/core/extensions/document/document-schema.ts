import { NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { LIST_LEAD_GROUP } from '../lists/list-schema';
import { readTextAlign, textAlignAttrs } from '../text-align/text-align-schema';

// Paragraphs and headings can start a list item (the list_lead group).
export const paragraph: NodeSpec = {
  ...basicNodes.paragraph,
  group: `block ${LIST_LEAD_GROUP}`,
  attrs: { align: { default: null } },
  parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: readTextAlign(dom as HTMLElement) }) }],
  toDOM: (node) => ['p', textAlignAttrs(node.attrs['align']), 0],
};
