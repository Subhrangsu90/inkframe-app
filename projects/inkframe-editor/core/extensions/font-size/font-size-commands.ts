import { Command, EditorState } from 'prosemirror-state';
import { sanitizeFontSize } from './font-size-schema';

/** Sets the font size of the selection's text, or of the text typed next when nothing is selected. */
export function setFontSizeCommand(size: number): Command {
  const value = sanitizeFontSize(size);
  return (state, dispatch) => {
    const markType = state.schema.marks['fontSize'];
    if (!markType || !value) return false;
    const mark = markType.create({ size: value });
    if (state.selection.empty) {
      dispatch?.(state.tr.addStoredMark(mark));
      return true;
    }
    if (dispatch) {
      const tr = state.tr;
      for (const { $from, $to } of state.selection.ranges) {
        tr.removeMark($from.pos, $to.pos, markType).addMark($from.pos, $to.pos, mark);
      }
      dispatch(tr);
    }
    return true;
  };
}

/** Resets the selection's text to the document's font size. */
export const removeFontSizeCommand: Command = (state, dispatch) => {
  const markType = state.schema.marks['fontSize'];
  if (!markType) return false;
  if (state.selection.empty) {
    dispatch?.(state.tr.removeStoredMark(markType));
    return true;
  }
  if (dispatch) {
    const tr = state.tr;
    for (const { $from, $to } of state.selection.ranges)
      tr.removeMark($from.pos, $to.pos, markType);
    dispatch(tr);
  }
  return true;
};

/**
 * The font size of the selection: the size all of its text has, or null when
 * it has the document's size or several sizes.
 */
export function fontSizeAt(state: EditorState): number | null {
  const markType = state.schema.marks['fontSize'];
  if (!markType) return null;
  const { empty, $from, from, to } = state.selection;
  if (empty) {
    return sanitizeFontSize(markType.isInSet(state.storedMarks ?? $from.marks())?.attrs['size']);
  }
  let size: number | null | undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (mixed) return false;
    if (!node.isText) return true;
    const own = sanitizeFontSize(markType.isInSet(node.marks)?.attrs['size']);
    if (size === undefined) size = own;
    else if (own !== size) mixed = true;
    return false;
  });
  return mixed ? null : (size ?? null);
}
