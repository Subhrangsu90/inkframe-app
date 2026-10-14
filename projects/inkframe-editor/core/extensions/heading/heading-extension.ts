import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { createExtension } from '../../editor/extension-types';
import { setBlockTypeKeepingAlign } from '../text-align/text-align-commands';
import { heading } from './heading-schema';

export const HeadingExtension = createExtension({
  name: 'heading',
  nodes: { heading },
  inputRules: (ctx) => [
    textblockTypeInputRule(/^(#{1,6})\s$/, ctx.schema.nodes['heading'], (m) => ({
      level: m[1].length,
    })),
  ],
  keymaps: (ctx) => ({
    'Mod-Alt-1': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 1 }),
    'Mod-Alt-2': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 2 }),
    'Mod-Alt-3': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 3 }),
    'Mod-Alt-4': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 4 }),
    'Mod-Alt-5': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 5 }),
    'Mod-Alt-6': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 6 }),
  }),
  slashItems: [
    {
      id: 'h1',
      label: 'Heading 1',
      hint: 'Large heading',
      icon: 'format_h1',
      keywords: ['h1', 'title'],
      run: (s) => s.heading(1),
    },
    {
      id: 'h2',
      label: 'Heading 2',
      hint: 'Medium heading',
      icon: 'format_h2',
      keywords: ['h2'],
      run: (s) => s.heading(2),
    },
    {
      id: 'h3',
      label: 'Heading 3',
      hint: 'Small heading',
      icon: 'format_h3',
      keywords: ['h3'],
      run: (s) => s.heading(3),
    },
  ],
});
