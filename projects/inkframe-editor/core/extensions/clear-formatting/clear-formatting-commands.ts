import { Command } from 'prosemirror-state';

/** Removes every mark from the selection, and the stored marks at the cursor. */
export const clearFormattingCommand: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  let tr = state.tr;
  if (empty) {
    dispatch?.(tr.setStoredMarks([]));
    return true;
  }
  Object.values(state.schema.marks).forEach((mark) => {
    tr = tr.removeMark(from, to, mark);
  });
  dispatch?.(tr.setStoredMarks([]));
  return true;
};
