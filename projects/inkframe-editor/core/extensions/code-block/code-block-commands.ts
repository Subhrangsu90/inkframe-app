import { Attrs } from 'prosemirror-model';
import { Command } from 'prosemirror-state';

/** Changes attributes of the code block at `pos`; fails when there is none there. */
function updateCodeBlockAt(pos: number, attrs: (current: Attrs) => Attrs): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (node && node.type.name === 'code_block') {
      dispatch?.(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs(node.attrs) }));
      return true;
    }
    return false;
  };
}

/** Sets the language of the code block at `pos`. */
export function setCodeBlockLanguageCommand(pos: number, language: string): Command {
  return updateCodeBlockAt(pos, () => ({ language }));
}

/** Turns line wrapping of the code block at `pos` on or off. */
export function toggleCodeBlockWrapCommand(pos: number): Command {
  return updateCodeBlockAt(pos, (attrs) => ({ wrap: !attrs['wrap'] }));
}
