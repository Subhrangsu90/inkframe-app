import { Command, EditorState, Plugin } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import { undoInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { DEFAULT_HIGHLIGHT_COLOR, schema } from '../schema/schema';
import { buildInputRules } from './input-rules';
import { menusPlugin } from '../editor/menus.plugin';
import { highlightPlugin } from './code-block/highlight.plugin';
import { tableUIPlugin } from './table/table-ui.plugin';
import { EditorHooks } from '../editor/editor-hooks';
import { listKeymap, toggleListCommand } from './lists/list-commands';
import { listJoinPlugin } from './lists/list-join.plugin';
import { listDragPlugin } from './lists/list-drag.plugin';

// Lists moved to ./lists; kept here for code that imports it from this module.
export { toggleListCommand } from './lists/list-commands';

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(
    state.tr.replaceSelectionWith(state.schema.nodes['hard_break'].create()).scrollIntoView(),
  );
  return true;
};

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

export function buildPlugins(hooks: EditorHooks): Plugin[] {
  const { strong, em, code, underline, strikethrough, subscript, superscript, small } =
    schema.marks;
  const { paragraph, heading } = schema.nodes;

  return [
    buildInputRules(),
    history(),
    menusPlugin(hooks), // before keymaps so the slash menu sees keys first
    keymap({ Backspace: undoInputRule }), // one Backspace undoes an auto-conversion
    keymap({
      // tables first: Tab returns false outside a table
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
    }),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': toggleMark(strong),
      'Mod-i': toggleMark(em),
      'Mod-u': toggleMark(underline),
      'Shift-Mod-s': toggleMark(strikethrough),
      'Shift-Mod-,': toggleMark(subscript),
      'Shift-Mod-.': toggleMark(superscript),
      'Mod-e': toggleMark(code),
      'Shift-Mod-m': toggleMark(code),
      'Mod-\\': clearFormattingCommand,
      'Shift-Mod-8': toggleListCommand('bullet_list'),
      'Shift-Mod-7': toggleListCommand('ordered_list'),
      'Shift-Mod-6': toggleListCommand('task_list'),
      'Mod-Alt-0': setBlockType(paragraph),
      'Mod-Alt-7': toggleMark(small),
      'Mod-Alt-1': setBlockType(heading, { level: 1 }),
      'Mod-Alt-2': setBlockType(heading, { level: 2 }),
      'Mod-Alt-3': setBlockType(heading, { level: 3 }),
      'Mod-Alt-4': setBlockType(heading, { level: 4 }),
      'Mod-Alt-5': setBlockType(heading, { level: 5 }),
      'Mod-Alt-6': setBlockType(heading, { level: 6 }),
      'Shift-Enter': hardBreak,
    }),
    keymap(listKeymap()),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
    columnResizing({
      handleWidth: 6,
      cellMinWidth: 45,
      lastColumnResizable: true,
    }),
    tableEditing(),
    highlightPlugin(),
    tableUIPlugin(),
    listJoinPlugin(),
    listDragPlugin(),
  ];
}
