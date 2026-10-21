import { createExtension } from '../../editor/extension-types';
import { fontSize } from './font-size-schema';

/** Font sizes for selected text, from the toolbar (`FONT_SIZES`). */
export const FontSizeExtension = createExtension({
  name: 'fontSize',
  marks: { fontSize },
});
