import { createExtension } from '../../editor/extension-types';
import { page_break } from './page-break-schema';
import { insertPageBreakCommand } from './page-setup-commands';

/**
 * Page setup: Pages or Pageless layout, paper size, orientation, margins and
 * page color, set in the Page setup dialog (opened from the status bar or with
 * `EditorService.requestPageSetup()`) and with the ruler. Also the page break
 * block: `Mod-Enter` or "Page break" in the slash menu.
 *
 * The setup itself is the `page` attribute of the `doc` node, which every
 * schema has, so documents load with or without this extension.
 */
export const PageSetupExtension = createExtension({
  name: 'page_setup',
  nodes: { page_break },
  keymaps: () => ({
    'Mod-Enter': insertPageBreakCommand,
  }),
  slashItems: [
    {
      id: 'page_break',
      label: 'Page break',
      hint: 'Start a new page when printed',
      icon: 'insert_page_break',
      keywords: ['page', 'break', 'new page', 'print'],
      run: (svc) => svc.insertPageBreak(),
    },
  ],
});
