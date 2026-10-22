import { Command, Plugin } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import {
  inputRules,
  textblockTypeInputRule,
  undoInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { schema } from '../schema/schema';
import { menusPlugin } from '../editor/menus.plugin';
import { EditorHooks } from '../editor/editor-hooks';
import { highlightPlugin } from '../extensions/code-block/highlight.plugin';
import { tableUIPlugin } from '../extensions/table/table-ui.plugin';
import { clearFormattingCommand } from '../extensions/clear-formatting/clear-formatting-commands';
import { markRule } from '../extensions/marks/mark-input-rule';
import { listKeymap, toggleListCommand } from '../extensions/lists/list-commands';
import {
  bulletListRule,
  orderedListRule,
  taskItemRule,
} from '../extensions/lists/list-input-rules';
import { listJoinPlugin } from '../extensions/lists/list-join.plugin';
import { listDragPlugin } from '../extensions/lists/list-drag.plugin';

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(
    state.tr.replaceSelectionWith(state.schema.nodes['hard_break'].create()).scrollIntoView(),
  );
  return true;
};

/** @deprecated Predates the extension system: use `DEFAULT_EXTENSIONS` (or your own list) with `ExtensionManager`, or `<ink-editor>`. Removed in 2.0. */
export const buildInputRules = () => {
  const { heading, bullet_list, ordered_list, blockquote, code_block } = schema.nodes;
  const { strong, em, code, strikethrough, superscript, subscript } = schema.marks;

  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, heading, (m) => ({
        level: m[1].length,
      })),
      bulletListRule(bullet_list),
      orderedListRule(ordered_list),
      taskItemRule(),
      wrappingInputRule(/^\s*>\s$/, blockquote),
      textblockTypeInputRule(/^`{3}([a-z0-9_-]+)?\s$/, code_block, (m) => ({
        language: m[1]?.toLowerCase() || 'typescript',
      })),
      markRule(/\*\*([^*]+)\*\*$/, strong),
      markRule(/(?:^|\s)_([^_\s][^_]*)_$/, em),
      markRule(/~~([^~]+)~~$/, strikethrough),
      markRule(/\^([^^]+)\^$/, superscript),
      markRule(/~([^~]+)~$/, subscript),
      markRule(/`([^`]+)`$/, code),
    ],
  });
};

/** @deprecated Predates the extension system: use `DEFAULT_EXTENSIONS` (or your own list) with `ExtensionManager`, or `<ink-editor>`. Removed in 2.0. */
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
