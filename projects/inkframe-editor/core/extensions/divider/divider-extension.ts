import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { createExtension } from '../../editor/extension-types';

export const DividerExtension = createExtension({
  name: 'divider',
  nodes: { horizontal_rule: basicNodes.horizontal_rule },
  slashItems: [
    {
      id: 'hr',
      label: 'Divider',
      hint: 'Horizontal separator line',
      icon: 'horizontal_rule',
      keywords: ['hr', 'line', 'divider', 'separator'],
      run: (s) => s.insertDivider(),
    },
  ],
});
