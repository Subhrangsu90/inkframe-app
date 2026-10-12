import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';

export const placeholderKey = new PluginKey('ink-placeholder');

export const DEFAULT_PLACEHOLDER = 'Type / for commands…';

/** True for a document that holds nothing but one empty paragraph. */
export function isDocEmpty(doc: PMNode): boolean {
  const first = doc.firstChild;
  return doc.childCount === 1 && !!first && first.type.name === 'paragraph' && first.content.size === 0;
}

/**
 * Shows `text` in an empty document. The text comes from CSS (`::before`
 * with the `data-placeholder` attribute), so it is never part of the content,
 * and is exposed to assistive technology through `aria-placeholder`.
 */
export function placeholderPlugin(text: string = DEFAULT_PLACEHOLDER): Plugin {
  return new Plugin({
    key: placeholderKey,
    props: {
      decorations(state) {
        if (!isDocEmpty(state.doc)) return null;
        const paragraph = state.doc.firstChild!;
        return DecorationSet.create(state.doc, [
          Decoration.node(0, paragraph.nodeSize, {
            class: 'ink-placeholder',
            'data-placeholder': text,
          }),
        ]);
      },
      attributes: (state): Record<string, string> =>
        isDocEmpty(state.doc) ? { 'aria-placeholder': text } : {},
    },
  });
}
