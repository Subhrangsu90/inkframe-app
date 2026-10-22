import { Command, EditorState } from 'prosemirror-state';
import { DEFAULT_HIGHLIGHT_COLOR } from './highlight-schema';

function hasMarkInSelection(state: EditorState, name: string): boolean {
  const type = state.schema.marks[name];
  if (!type) return false;
  const { from, to, empty, $from } = state.selection;
  return empty
    ? !!type.isInSet(state.storedMarks ?? $from.marks())
    : state.doc.rangeHasMark(from, to, type);
}

/** Highlights the selection in `color`, replacing any other highlight color. */
export function setHighlightCommand(color: string = DEFAULT_HIGHLIGHT_COLOR): Command {
  return (state, dispatch) => {
    const type = state.schema.marks['highlight'];
    if (!type) return false;
    if (dispatch) {
      const { from, to, empty } = state.selection;
      const mark = type.create({ color });
      dispatch(
        empty
          ? state.tr.removeStoredMark(type).addStoredMark(mark)
          : state.tr.removeMark(from, to, type).addMark(from, to, mark),
      );
    }
    return true;
  };
}

export const removeHighlightCommand: Command = (state, dispatch) => {
  const type = state.schema.marks['highlight'];
  if (!type) return false;
  if (dispatch) {
    const { from, to, empty } = state.selection;
    dispatch(empty ? state.tr.removeStoredMark(type) : state.tr.removeMark(from, to, type));
  }
  return true;
};

/** Removes the highlight when the selection has one, otherwise applies the default color. */
export const toggleHighlightCommand: Command = (state, dispatch, view) =>
  hasMarkInSelection(state, 'highlight')
    ? removeHighlightCommand(state, dispatch, view)
    : setHighlightCommand()(state, dispatch, view);
