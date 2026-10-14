import { createExtension } from '../../editor/extension-types';
import { pasteCleanupPlugin } from './paste-cleanup';

/** Cleans up HTML pasted from Word, Google Docs and web pages (see `cleanPastedHtml`). */
export const PasteCleanupExtension = createExtension({
  name: 'paste_cleanup',
  plugins: () => [pasteCleanupPlugin()],
});
