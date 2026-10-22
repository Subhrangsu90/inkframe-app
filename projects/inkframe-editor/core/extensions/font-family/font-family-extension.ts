import { createExtension } from '../../editor/extension-types';
import { fontFamily } from './font-family-schema';

/** Fonts for selected text, from the toolbar (`FONT_FAMILIES`). */
export const FontFamilyExtension = createExtension({
  name: 'fontFamily',
  marks: { fontFamily },
});
