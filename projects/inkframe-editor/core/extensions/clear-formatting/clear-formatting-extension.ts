import { createExtension } from '../../editor/extension-types';
import { clearFormattingCommand } from './clear-formatting-commands';

export const ClearFormattingExtension = createExtension({
  name: 'clear_formatting',
  keymaps: () => ({
    'Mod-\\': clearFormattingCommand,
  }),
  toolbarItems: [
    {
      id: 'clearFormatting',
      group: 'action',
      icon: 'format_clear',
      tooltip: 'Clear formatting (Ctrl+\\)',
      shortcut: 'Ctrl+\\',
      run: (s) => s.clearFormatting(),
    },
  ],
});
