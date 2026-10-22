import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { wrappingInputRule } from 'prosemirror-inputrules';
import { createExtension } from '../../editor/extension-types';

export const BlockquoteExtension = createExtension({
  name: 'blockquote',
  nodes: { blockquote: basicNodes.blockquote },
  inputRules: (ctx) => [wrappingInputRule(/^\s*>\s$/, ctx.schema.nodes['blockquote'])],
  slashItems: [
    {
      id: 'q',
      label: 'Quote',
      hint: 'Blockquote',
      icon: 'format_quote',
      keywords: ['blockquote', 'quote'],
      run: (s) => s.blockquote(),
    },
  ],
});
