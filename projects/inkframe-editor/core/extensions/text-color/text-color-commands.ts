import { Command } from 'prosemirror-state';

/** Colors the selection's text, or the text typed next when nothing is selected. */
export function setTextColorCommand(color: string): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks['textColor'];
    if (!markType) return false;
    const { from, to, empty } = state.selection;
    if (empty) {
      dispatch?.(state.tr.addStoredMark(markType.create({ color })));
    } else {
      dispatch?.(
        state.tr.removeMark(from, to, markType).addMark(from, to, markType.create({ color })),
      );
    }
    return true;
  };
}

/** Removes the text color from the selection. */
export const removeTextColorCommand: Command = (state, dispatch) => {
  const markType = state.schema.marks['textColor'];
  if (!markType) return false;
  const { from, to, empty } = state.selection;
  if (empty) {
    dispatch?.(state.tr.removeStoredMark(markType));
  } else {
    dispatch?.(state.tr.removeMark(from, to, markType));
  }
  return true;
};
