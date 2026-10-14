import { EditorExtension, createExtension } from '../../editor/extension-types';
import { DEFAULT_PLACEHOLDER, placeholderPlugin } from './placeholder.plugin';

/** Shows `text` while the document is empty. */
export function createPlaceholderExtension(text: string = DEFAULT_PLACEHOLDER): EditorExtension {
  return createExtension({
    name: 'placeholder',
    plugins: () => [placeholderPlugin(text)],
  });
}

export const PlaceholderExtension = createPlaceholderExtension();
