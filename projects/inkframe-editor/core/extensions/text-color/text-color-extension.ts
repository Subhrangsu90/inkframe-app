import { createExtension } from '../../editor/extension-types';
import { textColor } from './text-color-schema';

export const TextColorExtension = createExtension({
  name: 'textColor',
  marks: { textColor },
});
