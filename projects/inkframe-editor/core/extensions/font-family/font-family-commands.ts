import { Command, EditorState } from 'prosemirror-state';
import { FontFamily, sanitizeFontFamily } from './font-family-schema';

/** Sets the font of the selection's text, or of the text typed next when nothing is selected. */
export function setFontFamilyCommand(font: FontFamily): Command {
  const value = sanitizeFontFamily(font);
  return (state, dispatch) => {
    const markType = state.schema.marks['fontFamily'];
    if (!markType || !value) return false;
    const mark = markType.create({ font: value });
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

/** Resets the selection's text to the document's font. */
export const removeFontFamilyCommand: Command = (state, dispatch) => {
  const markType = state.schema.marks['fontFamily'];
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
 * The font of the selection: the font all of its text has, or null when it
 * has the document's font or several fonts.
 */
export function fontFamilyAt(state: EditorState): FontFamily | null {
  const markType = state.schema.marks['fontFamily'];
  if (!markType) return null;
  const { empty, $from, from, to } = state.selection;
  if (empty) {
    return sanitizeFontFamily(markType.isInSet(state.storedMarks ?? $from.marks())?.attrs['font']);
  }
  let font: FontFamily | null | undefined;
  let mixed = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (mixed) return false;
    if (!node.isText) return true;
    const own = sanitizeFontFamily(markType.isInSet(node.marks)?.attrs['font']);
    if (font === undefined) font = own;
    else if (own !== font) mixed = true;
    return false;
  });
  return mixed ? null : (font ?? null);
}
