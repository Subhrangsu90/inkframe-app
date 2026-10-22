import { history, undo, redo } from 'prosemirror-history';
import { createExtension } from '../../editor/extension-types';

export const HistoryExtension = createExtension({
  name: 'history',
  plugins: () => [history()],
  keymaps: () => ({
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  }),
  toolbarItems: [
    {
      id: 'undo',
      group: 'history',
      icon: 'undo',
      tooltip: 'Undo (Ctrl+Z)',
      shortcut: 'Ctrl+Z',
      isDisabled: (s) => !s.canUndo(),
      run: (s) => s.undo(),
    },
    {
      id: 'redo',
      group: 'history',
      icon: 'redo',
      tooltip: 'Redo (Ctrl+Y)',
      shortcut: 'Ctrl+Y',
      isDisabled: (s) => !s.canRedo(),
      run: (s) => s.redo(),
    },
  ],
});
