import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { createExtension } from '../../editor/extension-types';
import { setBlockTypeKeepingFormat } from '../paragraph-format/paragraph-format-commands';
import { doc, paragraph } from './document-schema';

export const DocExtension = createExtension({
  name: 'doc',
  nodes: { doc },
});

export const ParagraphExtension = createExtension({
  name: 'paragraph',
  nodes: { paragraph },
  keymaps: (ctx) => ({
    'Mod-Alt-0': setBlockTypeKeepingFormat(ctx.schema.nodes['paragraph']),
  }),
  slashItems: [
    {
      id: 'p',
      label: 'Text',
      hint: 'Plain paragraph',
      icon: 'notes',
      keywords: ['paragraph', 'text'],
      run: (s) => s.paragraph(),
    },
  ],
});

export const TextExtension = createExtension({
  name: 'text',
  nodes: { text: basicNodes.text },
});

export const HardBreakExtension = createExtension({
  name: 'hard_break',
  nodes: { hard_break: basicNodes.hard_break },
  keymaps: (ctx) => ({
    'Shift-Enter': (state, dispatch) => {
      dispatch?.(
        state.tr.replaceSelectionWith(ctx.schema.nodes['hard_break'].create()).scrollIntoView(),
      );
      return true;
    },
  }),
});
