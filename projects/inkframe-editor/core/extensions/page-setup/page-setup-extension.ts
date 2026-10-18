import { createExtension } from '../../editor/extension-types';

/**
 * Page setup: Pages or Pageless layout, paper size, orientation and margins,
 * set in the Page setup dialog (opened from the status bar or with
 * `EditorService.requestPageSetup()`).
 *
 * The setup itself is the `page` attribute of the `doc` node, which every
 * schema has, so documents load with or without this extension.
 */
export const PageSetupExtension = createExtension({
  name: 'page_setup',
});
