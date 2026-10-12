import { Command, EditorState, Plugin, Selection } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, splitBlockAs, toggleMark } from 'prosemirror-commands';
import {
  splitListItem,
  sinkListItem,
  liftListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import { Attrs, Node as PMNode, NodeType } from 'prosemirror-model';
import { undoInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { DEFAULT_HIGHLIGHT_COLOR, TextAlign, sanitizeTextAlign, schema } from './schema';
import { buildInputRules } from './input-rules';
import { menusPlugin } from './menus.plugin';
import { highlightPlugin } from './highlight.plugin';
import { tableUIPlugin } from './table-ui.plugin';
import { EditorHooks } from './editor-hooks';

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(
    state.tr
      .replaceSelectionWith(state.schema.nodes['hard_break'].create())
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

const supportsAlign = (type: NodeType) => !!type.spec.attrs?.['align'];

/** Calls `f` for every textblock the selection touches (each cell of a cell selection). */
function forEachSelectedTextblock(
  state: EditorState,
  f: (node: PMNode, pos: number) => void,
): void {
  for (const { $from, $to } of state.selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      f(node, pos);
      return false;
    });
  }
}

/**
 * Aligns the paragraphs and headings in the selection. `left` (or null)
 * resets to the default. Not applicable when the selection only covers
 * blocks that cannot be aligned, such as code blocks.
 */
export function setTextAlignCommand(align: TextAlign | null): Command {
  const value = sanitizeTextAlign(align);
  return (state, dispatch) => {
    const targets: number[] = [];
    forEachSelectedTextblock(state, (node, pos) => {
      if (supportsAlign(node.type)) targets.push(pos);
    });
    if (!targets.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of targets) {
        if (tr.doc.nodeAt(pos)!.attrs['align'] !== value) tr.setNodeAttribute(pos, 'align', value);
      }
      dispatch(tr);
    }
    return true;
  };
}

/** The alignment of the textblock at the selection head, or null when it cannot be aligned. */
export function textAlignAt(state: EditorState): TextAlign | null {
  const parent = state.selection.$head.parent;
  if (!supportsAlign(parent.type)) return null;
  return sanitizeTextAlign(parent.attrs['align']) ?? 'left';
}

/**
 * `setBlockType` that keeps each block's alignment, so turning a centered
 * paragraph into a heading (or back) keeps it centered.
 */
export function setBlockTypeKeepingAlign(nodeType: NodeType, attrs: Attrs | null = null): Command {
  const command = setBlockType(nodeType, attrs);
  if (!supportsAlign(nodeType)) return command;
  return (state, dispatch, view) =>
    command(
      state,
      dispatch &&
        ((tr) => {
          forEachSelectedTextblock(state, (node, pos) => {
            const align = node.attrs['align'];
            const mapped = tr.mapping.map(pos);
            const now = tr.doc.nodeAt(mapped);
            if (align && now?.type === nodeType && now.attrs['align'] !== align) {
              tr.setNodeAttribute(mapped, 'align', align);
            }
          });
          dispatch(tr);
        }),
      view,
    );
}

/**
 * Enter at the end of an aligned paragraph or heading: the new paragraph
 * keeps the alignment, as in word processors. Returns false otherwise so the
 * default Enter behavior runs (splitting in the middle already keeps attributes).
 */
export const splitAlignedBlockCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const parent = $from.parent;
  const align = sanitizeTextAlign(parent.attrs['align']);
  const paragraph = state.schema.nodes['paragraph'];
  if (
    !empty ||
    !align ||
    !paragraph ||
    !supportsAlign(paragraph) ||
    parent.content.size === 0 ||
    $from.parentOffset !== parent.content.size
  ) {
    return false;
  }
  return splitBlockAs((_node, atEnd) => (atEnd ? { type: paragraph, attrs: { align } } : null))(
    state,
    dispatch,
  );
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

    const targetList = state.schema.nodes[kind];
    if (!targetList) return false;

    // 1. If not currently inside any list: wrap in the requested list
    if (listDepth === -1) {
      return wrapInList(targetList)(state, dispatch);
    }

    const currentListNode = $from.node(listDepth);
    const currentKind = currentListNode.type.name;

    // 2. If already in this exact list type: toggle off (lift out of list)
    if (currentKind === kind) {
      const itemType = kind === 'task_list' ? task_item : list_item;
      return itemType ? liftListItem(itemType)(state, dispatch) : false;
    }

    // 3. Auto-switch seamlessly between list types!
    // Converting to/from a task list needs both item types in the schema.
    if ((kind === 'task_list' || currentKind === 'task_list') && (!task_item || !list_item)) {
      return false;
    }
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
