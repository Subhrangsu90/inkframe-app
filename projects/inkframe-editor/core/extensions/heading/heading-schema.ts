import { NodeSpec } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { LIST_LEAD_GROUP } from '../lists/list-schema';
import {
  blockFormatAttrSpecs,
  blockFormatDomAttrs,
  readBlockFormat,
} from '../paragraph-format/paragraph-format-schema';

// Headings can start a list item (the list_lead group), like paragraphs.
export const heading: NodeSpec = {
  ...basicNodes.heading,
  group: `block ${LIST_LEAD_GROUP}`,
  attrs: { level: { default: 1, validate: 'number' }, ...blockFormatAttrSpecs() },
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs: (dom: HTMLElement) => ({ level, ...readBlockFormat(dom) }),
  })),
  toDOM: (node) => [`h${node.attrs['level']}`, blockFormatDomAttrs(node.attrs), 0],
};
