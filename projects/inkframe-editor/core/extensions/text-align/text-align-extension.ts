import { createExtension } from '../../editor/extension-types';
import { setTextAlignCommand, splitAlignedBlockCommand } from './text-align-commands';

/** Left, center, right and justified paragraphs and headings. */
export const TextAlignExtension = createExtension({
  name: 'text_align',
  keymaps: () => ({
    'Shift-Mod-l': setTextAlignCommand('left'),
    'Shift-Mod-e': setTextAlignCommand('center'),
    'Shift-Mod-r': setTextAlignCommand('right'),
    'Shift-Mod-j': setTextAlignCommand('justify'),
    Enter: splitAlignedBlockCommand,
  }),
});
