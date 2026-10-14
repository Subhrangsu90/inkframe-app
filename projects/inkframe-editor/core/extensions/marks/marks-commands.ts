import { Command } from 'prosemirror-state';

/**
 * Toggles inline code. Code text carries no other formatting, so making a
 * selection code removes its other marks.
 */
export const toggleCodeCommand: Command = (state, dispatch) => {
  const codeType = state.schema.marks['code'];
  if (!codeType) return false;
  const { from, to, empty, $from } = state.selection;
  const hasCode = empty
    ? !!codeType.isInSet(state.storedMarks ?? $from.marks())
    : state.doc.rangeHasMark(from, to, codeType);

  let tr = state.tr;
  if (hasCode) {
    if (empty) {
      tr = tr.removeStoredMark(codeType);
    } else {
      tr = tr.removeMark(from, to, codeType);
    }
  } else {
    if (empty) {
      tr = tr.setStoredMarks([codeType.create()]);
    } else {
      Object.values(state.schema.marks).forEach((m) => {
        if (m !== codeType) {
          tr = tr.removeMark(from, to, m);
        }
      });
      tr = tr.addMark(from, to, codeType.create());
    }
  }
  dispatch?.(tr);
  return true;
};
