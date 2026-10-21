import { createExtension } from '../../editor/extension-types';
import {
  indentCommand,
  outdentAtStartCommand,
  outdentCommand,
  splitFormattedBlockCommand,
} from './paragraph-format-commands';

/**
 * Paragraph and heading indent: `Mod-]` and `Mod-[` (as in Google Docs), and
 * Backspace at the start of an indented block. Tab stays with lists and
 * tables, so it still moves focus out of the document elsewhere.
 */
export const IndentExtension = createExtension({
  name: 'indent',
  keymaps: () => ({
    'Mod-]': indentCommand,
    'Mod-[': outdentCommand,
    Backspace: outdentAtStartCommand,
    Enter: splitFormattedBlockCommand,
  }),
});

/** Line spacing for paragraphs and headings (Single, 1.15, 1.5, Double). */
export const LineSpacingExtension = createExtension({
  name: 'line_spacing',
  keymaps: () => ({
    Enter: splitFormattedBlockCommand,
  }),
});
