import { Command, Plugin } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import {
  splitListItem,
  sinkListItem,
  liftListItem,
} from 'prosemirror-schema-list';
import { undoInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { schema } from './schema';
import { buildInputRules } from './input-rules';
import { menusPlugin } from './menus.plugin';
import { EditorHooks } from './editor-hooks';

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(
    state.tr
      .replaceSelectionWith(schema.nodes['hard_break'].create())
      .scrollIntoView(),
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

export function buildPlugins(hooks: EditorHooks): Plugin[] {
  const {
    strong,
    em,
    code,
    underline,
    strikethrough,
    subscript,
    superscript,
  } = schema.marks;
  const { list_item } = schema.nodes;

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
      'Mod-\\': clearFormattingCommand,
      'Shift-Enter': hardBreak,
      Enter: splitListItem(list_item), // new bullet; empty item exits the list
      Tab: sinkListItem(list_item),
      'Shift-Tab': liftListItem(list_item),
    }),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
    columnResizing(),
    tableEditing(),
  ];
}
