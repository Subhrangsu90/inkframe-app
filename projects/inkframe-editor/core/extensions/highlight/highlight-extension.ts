import { createExtension } from '../../editor/extension-types';
import { highlight } from './highlight-schema';
import { toggleHighlightCommand } from './highlight-commands';

/** Background color behind text, picked from `HIGHLIGHT_COLORS`. */
export const HighlightExtension = createExtension({
  name: 'highlight',
  marks: { highlight },
  keymaps: () => ({
    'Mod-Alt-h': toggleHighlightCommand,
  }),
});
