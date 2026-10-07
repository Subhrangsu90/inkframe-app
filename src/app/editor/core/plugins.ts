import { Command, Plugin, Selection } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import {
  splitListItem,
  sinkListItem,
  liftListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import { Node as PMNode } from 'prosemirror-model';
import { undoInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { schema } from './schema';
import { buildInputRules } from './input-rules';
import { menusPlugin } from './menus.plugin';
import { highlightPlugin } from './highlight.plugin';
import { tableUIPlugin } from './table-ui.plugin';
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

export function toggleListCommand(kind: 'bullet_list' | 'ordered_list' | 'task_list'): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const { bullet_list, ordered_list, task_list, list_item, task_item } = state.schema.nodes;

    // Find innermost list ancestor
    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      const typeName = $from.node(d).type.name;
      if (typeName === 'bullet_list' || typeName === 'ordered_list' || typeName === 'task_list') {
        listDepth = d;
        break;
      }
    }

    // 1. If not currently inside any list: wrap in the requested list
    if (listDepth === -1) {
      return wrapInList(state.schema.nodes[kind])(state, dispatch);
    }

    const currentListNode = $from.node(listDepth);
    const currentKind = currentListNode.type.name;

    // 2. If already in this exact list type: toggle off (lift out of list)
    if (currentKind === kind) {
      const itemType = kind === 'task_list' ? task_item : list_item;
      return liftListItem(itemType)(state, dispatch);
    }

    // 3. Auto-switch seamlessly between list types!
    if (!dispatch) return true;

    const listPos = $from.before(listDepth);
    let tr = state.tr;

    if (
      (currentKind === 'bullet_list' && kind === 'ordered_list') ||
      (currentKind === 'ordered_list' && kind === 'bullet_list')
    ) {
      // Direct markup swap between bullet_list and ordered_list
      tr = tr.setNodeMarkup(listPos, state.schema.nodes[kind]);
    } else if (kind === 'task_list') {
      // Convert list_item children to task_item children with checked: false
      const items: PMNode[] = [];
      currentListNode.forEach((child) => {
        if (child.type === list_item) {
          items.push(task_item.create({ checked: false }, child.content));
        } else {
          items.push(child);
        }
      });
      const newListNode = task_list.create(null, items);
      tr = tr.replaceWith(listPos, listPos + currentListNode.nodeSize, newListNode);
    } else {
      // Converting from task_list to bullet_list or ordered_list
      const items: PMNode[] = [];
      currentListNode.forEach((child) => {
        if (child.type === task_item) {
          items.push(list_item.create(null, child.content));
        } else {
          items.push(child);
        }
      });
      const newListNode = state.schema.nodes[kind].create(null, items);
      tr = tr.replaceWith(listPos, listPos + currentListNode.nodeSize, newListNode);
    }

    const mappedPos = tr.mapping.map($from.pos);
    tr = tr.setSelection(Selection.near(tr.doc.resolve(mappedPos)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function buildPlugins(hooks: EditorHooks): Plugin[] {
  const {
    strong,
    em,
    code,
    underline,
    strikethrough,
    subscript,
    superscript,
    small,
  } = schema.marks;
  const { list_item, task_item, bullet_list, ordered_list, task_list, paragraph, heading } = schema.nodes;

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
      Enter: (state, dispatch) =>
        splitListItem(task_item, { checked: false })(state, dispatch) ||
        liftListItem(task_item)(state, dispatch) ||
        splitListItem(list_item)(state, dispatch) ||
        liftListItem(list_item)(state, dispatch),
      Tab: (state, dispatch) =>
        sinkListItem(task_item)(state, dispatch) ||
        sinkListItem(list_item)(state, dispatch),
      'Shift-Tab': (state, dispatch) =>
        liftListItem(task_item)(state, dispatch) ||
        liftListItem(list_item)(state, dispatch),
    }),
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
  ];
}
