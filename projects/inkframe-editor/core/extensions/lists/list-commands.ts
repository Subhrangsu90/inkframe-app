import { Attrs, Fragment, Node as PMNode, NodeType, ResolvedPos } from 'prosemirror-model';
import { Command, EditorState, Selection, TextSelection, Transaction } from 'prosemirror-state';
import { canJoin } from 'prosemirror-transform';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { joinTextblockBackward, joinTextblockForward } from 'prosemirror-commands';
import { closeHistory } from 'prosemirror-history';
import {
  LIST_KINDS,
  ListKind,
  NumberStyle,
  sanitizeBulletStyle,
  sanitizeListStart,
  sanitizeNumberStyle,
} from './list-schema';

/** Lists nest at most this many levels deep (as in Word and Google Docs). */
export const MAX_LIST_DEPTH = 9;

/**
 * Transaction meta that keeps the list-join plugin from merging the lists
 * this transaction leaves next to each other (restarting the numbering
 * splits a list on purpose).
 */
export const SKIP_LIST_JOIN = 'inkSkipListJoin';

type Dispatch = ((tr: Transaction) => void) | undefined;

// ── Node helpers ──────────────────────────────────────────────────

export function isListNode(node: PMNode | null | undefined): boolean {
  return !!node && (LIST_KINDS as readonly string[]).includes(node.type.name);
}

export function isListItemNode(node: PMNode | null | undefined): boolean {
  return !!node && (node.type.name === 'list_item' || node.type.name === 'task_item');
}

/** The item type a list holds: `list_item`, or `task_item` for task lists. */
export function itemTypeOf(listType: NodeType): NodeType {
  return listType.contentMatch.defaultType!;
}

/** `item` as an item of `itemType`, keeping its content. A converted task starts unchecked. */
export function convertListItem(item: PMNode, itemType: NodeType): PMNode {
  if (item.type === itemType) return item;
  return itemType.create(itemType.name === 'task_item' ? { checked: false } : null, item.content);
}

/** `list` as a list of `listType`, with its items converted and its attributes kept. */
export function convertList(list: PMNode, listType: NodeType, attrs: Attrs = list.attrs): PMNode {
  const itemType = itemTypeOf(listType);
  const items: PMNode[] = [];
  list.forEach((item) => items.push(convertListItem(item, itemType)));
  return listType.create(attrs, items);
}

/** How many levels of lists `node` contains (0 when none). */
export function nestedListDepth(node: PMNode): number {
  let deepest = 0;
  node.forEach((child) => {
    if (isListNode(child)) {
      child.forEach((item) => (deepest = Math.max(deepest, 1 + nestedListDepth(item))));
    } else if (!child.isTextblock) {
      deepest = Math.max(deepest, nestedListDepth(child));
    }
  });
  return deepest;
}

/** The innermost list item around a position, and its list. */
export interface ListItemContext {
  item: PMNode;
  itemPos: number;
  itemDepth: number;
  list: PMNode;
  listPos: number;
  listDepth: number;
  /** The item's index in its list. */
  index: number;
}

/** The innermost list item around `$pos`. Never looks past a table cell. */
export function findListItem($pos: ResolvedPos): ListItemContext | null {
  for (let d = $pos.depth; d > 1; d--) {
    const node = $pos.node(d);
    if (isListItemNode(node) && isListNode($pos.node(d - 1))) {
      return {
        item: node,
        itemPos: $pos.before(d),
        itemDepth: d,
        list: $pos.node(d - 1),
        listPos: $pos.before(d - 1),
        listDepth: d - 1,
        index: $pos.index(d - 1),
      };
    }
    if (node.type.spec.isolating) return null;
  }
  return null;
}

/** How many lists enclose depth `depth` of `$pos`, counting the one at `depth`. */
function listLevel($pos: ResolvedPos, depth: number): number {
  let level = 0;
  for (let d = depth; d > 0; d--) {
    const node = $pos.node(d);
    if (isListNode(node)) level++;
    if (node.type.spec.isolating) break;
  }
  return level;
}

/** How many lists enclose `$pos` (up to the nearest table cell). */
export function listLevelAt($pos: ResolvedPos): number {
  return listLevel($pos, $pos.depth);
}

/** The indices of the items the selection covers in the list of `ctx`. */
function selectedItemRange(ctx: ListItemContext, $to: ResolvedPos): [number, number] {
  const inList =
    $to.depth > ctx.listDepth &&
    $to.before(ctx.listDepth) === ctx.listPos &&
    $to.pos < ctx.listPos + ctx.list.nodeSize;
  return [ctx.index, inList ? Math.max(ctx.index, $to.index(ctx.listDepth)) : ctx.index];
}

/** Position of the item at `index` in the list that starts at `listPos`. */
function itemPosAt(list: PMNode, listPos: number, index: number): number {
  let pos = listPos + 1;
  for (let i = 0; i < index; i++) pos += list.child(i).nodeSize;
  return pos;
}

/** Start of the first textblock in `node` (at `pos`), or null. */
function firstTextPos(node: PMNode, pos: number): number | null {
  while (!node.isTextblock) {
    if (!node.firstChild) return null;
    node = node.firstChild;
    pos += 1;
  }
  return pos + 1;
}

/** End of the last textblock in `node` (at `pos`), or null. */
function lastTextPos(node: PMNode, pos: number): number | null {
  let end = pos + node.nodeSize;
  while (!node.isTextblock) {
    if (!node.lastChild) return null;
    node = node.lastChild;
    end -= 1;
  }
  return end - 1;
}

// ── Keeping the cursor through structural changes ─────────────────
// Wrapping, unwrapping and converting lists never add, remove or edit
// textblocks, only the structure around them. The selection is stored as
// (textblock number, offset) and put back in the same place afterwards.

interface TextBookmark {
  index: number;
  offset: number;
}

function bookmarkAt(doc: PMNode, pos: number): TextBookmark | null {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  const start = $pos.start();
  let index = 0;
  let found = -1;
  doc.descendants((node, p) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    if (p + 1 === start) found = index;
    index++;
    return false;
  });
  return found < 0 ? null : { index: found, offset: $pos.parentOffset };
}

function resolveBookmark(doc: PMNode, bookmark: TextBookmark): number | null {
  let index = 0;
  let result: number | null = null;
  doc.descendants((node, p) => {
    if (result !== null) return false;
    if (!node.isTextblock) return true;
    if (index === bookmark.index) result = p + 1 + Math.min(bookmark.offset, node.content.size);
    index++;
    return false;
  });
  return result;
}

interface SelectionBookmark {
  anchor: TextBookmark;
  head: TextBookmark;
}

function bookmarkSelection(state: EditorState): SelectionBookmark | null {
  const { selection, doc } = state;
  if (!(selection instanceof TextSelection)) return null;
  const anchor = bookmarkAt(doc, selection.anchor);
  const head = bookmarkAt(doc, selection.head);
  return anchor && head ? { anchor, head } : null;
}

function restoreSelection(tr: Transaction, bookmark: SelectionBookmark | null): void {
  if (!bookmark) return;
  const anchor = resolveBookmark(tr.doc, bookmark.anchor);
  const head = resolveBookmark(tr.doc, bookmark.head);
  if (anchor !== null && head !== null) {
    tr.setSelection(TextSelection.create(tr.doc, anchor, head));
  }
}

/** Dispatches a structural list change as its own undo step. */
function dispatchStructural(dispatch: Dispatch, tr: Transaction): void {
  dispatch?.(closeHistory(tr).scrollIntoView());
}

// ── Joining adjacent lists ────────────────────────────────────────

/**
 * Whether `b`, right after `a`, can merge into it without changing what the
 * reader sees: same type and style, and for numbered lists, numbering that
 * continues (or the default start, 1).
 */
export function listsJoinable(a: PMNode, b: PMNode): boolean {
  if (a.type !== b.type || !isListNode(a)) return false;
  switch (a.type.name) {
    case 'bullet_list':
      return (
        sanitizeBulletStyle(a.attrs['bulletStyle']) === sanitizeBulletStyle(b.attrs['bulletStyle'])
      );
    case 'ordered_list': {
      if (
        sanitizeNumberStyle(a.attrs['numberStyle']) !== sanitizeNumberStyle(b.attrs['numberStyle'])
      ) {
        return false;
      }
      const next = sanitizeListStart(b.attrs['order']);
      return next === 1 || next === sanitizeListStart(a.attrs['order']) + a.childCount;
    }
    default:
      return true;
  }
}

/**
 * Joins adjacent joinable lists whose boundary lies between `from` and `to`
 * (and that `accept` allows, when given).
 */
export function joinAdjacentLists(
  tr: Transaction,
  from: number,
  to: number,
  accept: (boundary: number) => boolean = () => true,
): boolean {
  const doc = tr.doc;
  const lo = Math.max(0, from);
  const hi = Math.min(doc.content.size, to);
  const boundaries: number[] = [];
  doc.nodesBetween(
    Math.max(0, lo - 1),
    Math.min(doc.content.size, hi + 1),
    (node, pos, parent, index) => {
      if (parent && index > 0 && pos >= lo && pos <= hi && isListNode(node)) {
        const before = parent.child(index - 1);
        if (listsJoinable(before, node) && canJoin(doc, pos) && accept(pos)) boundaries.push(pos);
      }
      return !node.isTextblock;
    },
  );
  for (let i = boundaries.length - 1; i >= 0; i--) tr.join(boundaries[i]);
  return boundaries.length > 0;
}

// ── Unwrapping and outdenting ─────────────────────────────────────

/** Attributes for the part of `list` after `skipped` items that left it: numbering continues. */
function continuedAttrs(list: PMNode, skipped: number): Attrs {
  return list.type.name === 'ordered_list'
    ? { ...list.attrs, order: sanitizeListStart(list.attrs['order']) + skipped }
    : list.attrs;
}

/**
 * Turns the items `fromIdx..toIdx` of a list into the plain blocks they hold
 * (a paragraph, and any nested lists). The list is split around them, and a
 * numbered list's second part continues the numbering.
 */
function unwrapItems(
  state: EditorState,
  dispatch: Dispatch,
  ctx: ListItemContext,
  fromIdx: number,
  toIdx: number,
): boolean {
  const { list, listPos } = ctx;
  const $list = state.doc.resolve(listPos);
  const before: PMNode[] = [];
  const blocks: PMNode[] = [];
  const after: PMNode[] = [];
  list.forEach((item, _, i) => {
    if (i < fromIdx) before.push(item);
    else if (i <= toIdx) item.forEach((block) => blocks.push(block));
    else after.push(item);
  });
  const nodes: PMNode[] = [];
  if (before.length) nodes.push(list.type.create(list.attrs, before));
  nodes.push(...blocks);
  if (after.length) nodes.push(list.type.create(continuedAttrs(list, fromIdx), after));
  if (!$list.parent.canReplace($list.index(), $list.index() + 1, Fragment.from(nodes)))
    return false;
  if (dispatch) {
    const bookmark = bookmarkSelection(state);
    const tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, nodes);
    restoreSelection(tr, bookmark);
    dispatchStructural(dispatch, tr);
  }
  return true;
}

/**
 * Outdents items of a list nested in an item of another type (bullets inside
 * a task, tasks inside a bullet). The items move next to the parent item and
 * take its type; the items after them stay nested, under the last moved item.
 */
function outdentAcrossTypes(
  state: EditorState,
  dispatch: Dispatch,
  ctx: ListItemContext,
  fromIdx: number,
  toIdx: number,
): boolean {
  const { list, listDepth } = ctx;
  const $list = state.doc.resolve(ctx.listPos);
  const parentItem = $list.node(listDepth - 1);
  const parentItemPos = $list.before(listDepth - 1);
  const outerList = $list.node(listDepth - 2);
  const outerIndex = $list.index(listDepth - 2);
  const listIndex = $list.index(listDepth - 1);

  const before: PMNode[] = [];
  const moved: PMNode[] = [];
  const after: PMNode[] = [];
  list.forEach((item, _, i) => (i < fromIdx ? before : i <= toIdx ? moved : after).push(item));
  if (after.length) {
    const last = moved[moved.length - 1];
    moved[moved.length - 1] = last.copy(
      last.content.append(Fragment.from(list.type.create(list.attrs, after))),
    );
  }
  const outerItemType = itemTypeOf(outerList.type);
  const children: PMNode[] = [];
  parentItem.forEach((child, _, i) => {
    if (i !== listIndex) children.push(child);
    else if (before.length) children.push(list.copy(Fragment.from(before)));
  });
  const nodes = [
    parentItem.copy(Fragment.from(children)),
    ...moved.map((item) => convertListItem(item, outerItemType)),
  ];
  if (!outerList.canReplace(outerIndex, outerIndex + 1, Fragment.from(nodes))) return false;
  if (dispatch) {
    const bookmark = bookmarkSelection(state);
    const tr = state.tr.replaceWith(parentItemPos, parentItemPos + parentItem.nodeSize, nodes);
    restoreSelection(tr, bookmark);
    joinAdjacentLists(tr, parentItemPos, tr.mapping.map(parentItemPos + parentItem.nodeSize));
    dispatchStructural(dispatch, tr);
  }
  return true;
}

/**
 * Shift-Tab: moves the selected items one level out. Top-level items become
 * plain paragraphs (a numbered list split this way keeps counting).
 */
export const liftListItemCommand: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const ctx = findListItem($from);
  if (!ctx) return false;
  const [fromIdx, toIdx] = selectedItemRange(ctx, $to);
  const parent = ctx.listDepth > 1 ? $from.node(ctx.listDepth - 1) : null;
  const nested = isListItemNode(parent) && isListNode($from.node(ctx.listDepth - 2));
  if (!nested) return unwrapItems(state, dispatch, ctx, fromIdx, toIdx);
  if (parent!.type === ctx.item.type) {
    return liftListItem(ctx.item.type)(
      state,
      dispatch && ((tr) => dispatchStructural(dispatch, tr)),
    );
  }
  return outdentAcrossTypes(state, dispatch, ctx, fromIdx, toIdx);
};

// ── Enter and Tab ─────────────────────────────────────────────────

/**
 * Enter: splits the innermost item at the cursor. In an empty item it
 * outdents instead, and an empty top-level item leaves the list.
 */
export const splitListItemCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const ctx = findListItem($from);
  if (!ctx) return false;
  const itemType = ctx.item.type;
  const attrs = itemType.name === 'task_item' ? { checked: false } : undefined;
  if (splitListItem(itemType, attrs)(state, dispatch)) return true;
  const inEmptyItemBlock =
    empty && $from.parent.content.size === 0 && $from.depth === ctx.itemDepth + 1;
  return inEmptyItemBlock && liftListItemCommand(state, dispatch);
};

/**
 * Tab: nests the selected items under the item before them. Inside a list
 * Tab is always handled, also when there is nothing to nest under or the
 * depth limit is reached, so it never moves focus out of the editor.
 */
export function sinkListItemCommand(maxDepth: number = MAX_LIST_DEPTH): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const ctx = findListItem($from);
    if (!ctx) return false;
    const [fromIdx, toIdx] = selectedItemRange(ctx, $to);
    let deepest = 0;
    for (let i = fromIdx; i <= toIdx; i++) {
      deepest = Math.max(deepest, nestedListDepth(ctx.list.child(i)));
    }
    if (listLevel($from, ctx.listDepth) + 1 + deepest > maxDepth) return true;
    sinkListItem(ctx.item.type)(state, dispatch && ((tr) => dispatchStructural(dispatch, tr)));
    return true;
  };
}

/** Whether Tab would nest the item at the cursor (for toolbar state). */
export function canSinkListItem(state: EditorState, maxDepth: number = MAX_LIST_DEPTH): boolean {
  const ctx = findListItem(state.selection.$from);
  if (!ctx) return false;
  const [fromIdx, toIdx] = selectedItemRange(ctx, state.selection.$to);
  let deepest = 0;
  for (let i = fromIdx; i <= toIdx; i++) {
    deepest = Math.max(deepest, nestedListDepth(ctx.list.child(i)));
  }
  if (listLevel(state.selection.$from, ctx.listDepth) + 1 + deepest > maxDepth) return false;
  return sinkListItem(ctx.item.type)(state);
}

// ── Backspace and Delete ──────────────────────────────────────────

/**
 * Backspace (or Delete) with whole items selected, from the start of one
 * item's text to the end of another's in the same list: removes the items,
 * not just their text. Selecting every item removes the list.
 */
export const deleteSelectedListItemsCommand: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.empty) return false;
  const { $from, $to } = sel;
  for (let d = Math.min($from.depth, $to.depth); d > 1; d--) {
    const list = $from.node(d - 1);
    if (!isListNode(list) || $from.before(d - 1) !== $to.before(d - 1)) continue;
    if (!isListItemNode($from.node(d)) || !isListItemNode($to.node(d))) continue;
    const listPos = $from.before(d - 1);
    const fromIdx = $from.index(d - 1);
    const toIdx = $to.index(d - 1);
    const fromPos = itemPosAt(list, listPos, fromIdx);
    const toPos = itemPosAt(list, listPos, toIdx);
    const toItem = list.child(toIdx);
    if (
      firstTextPos(list.child(fromIdx), fromPos) !== $from.pos ||
      lastTextPos(toItem, toPos) !== $to.pos
    ) {
      return false;
    }
    if (dispatch) {
      const tr = state.tr;
      if (fromIdx === 0 && toIdx === list.childCount - 1) {
        const $list = state.doc.resolve(listPos);
        const paragraph = state.schema.nodes['paragraph'];
        const canRemove = $list.parent.canReplace($list.index(), $list.index() + 1);
        if (canRemove && isListItemNode($list.parent)) {
          tr.delete(listPos, listPos + list.nodeSize);
          tr.setSelection(Selection.near(tr.doc.resolve(listPos), -1));
        } else {
          tr.replaceWith(listPos, listPos + list.nodeSize, paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, listPos + 1));
        }
      } else {
        tr.delete(fromPos, toPos + toItem.nodeSize);
        tr.setSelection(Selection.near(tr.doc.resolve(fromPos), fromIdx > 0 ? -1 : 1));
      }
      dispatchStructural(dispatch, tr);
    }
    return true;
  }
  return false;
};

/**
 * Backspace at the start of a list item outdents it one level; at the top
 * level the item becomes a paragraph. Backspace at the start of a block right
 * after a list joins its text to the list's last item (instead of pulling the
 * block into the list as a new item).
 */
export const listBackspaceCommand: Command = (state, dispatch, view) => {
  if (deleteSelectedListItemsCommand(state, dispatch, view)) return true;
  const sel = state.selection;
  const $cursor = sel instanceof TextSelection ? sel.$cursor : null;
  if (!$cursor || $cursor.parentOffset > 0 || $cursor.parent.type.spec.code) return false;
  const depth = $cursor.depth;
  const parent = $cursor.node(depth - 1);
  const index = $cursor.index(depth - 1);
  if (depth >= 3 && index === 0 && isListItemNode(parent) && isListNode($cursor.node(depth - 2))) {
    return liftListItemCommand(state, dispatch, view);
  }
  const before = index > 0 ? parent.child(index - 1) : null;
  if (before && isListNode(before)) {
    let last: PMNode = before;
    while (!last.isTextblock && last.lastChild) last = last.lastChild;
    if (last.type.spec.code) return false;
    return joinTextblockBackward(state, dispatch, view);
  }
  return false;
};

/** The position between the cursor's block (or an ancestor) and the next block. */
function cutAfter($pos: ResolvedPos): ResolvedPos | null {
  for (let d = $pos.depth - 1; d >= 0; d--) {
    const parent = $pos.node(d);
    if ($pos.index(d) + 1 < parent.childCount) return $pos.doc.resolve($pos.after(d + 1));
    if (parent.type.spec.isolating) break;
  }
  return null;
}

/**
 * Delete at the end of a list item joins the next item's text to it (the
 * rest of that item follows), and at the end of a list's last item joins the
 * block after the list. Also joins a paragraph and the first item after it.
 */
export const listDeleteCommand: Command = (state, dispatch, view) => {
  if (deleteSelectedListItemsCommand(state, dispatch, view)) return true;
  const sel = state.selection;
  const $cursor = sel instanceof TextSelection ? sel.$cursor : null;
  if (!$cursor || $cursor.parentOffset < $cursor.parent.content.size) return false;
  if ($cursor.parent.type.spec.code) return false;
  const $cut = cutAfter($cursor);
  const after = $cut?.nodeAfter;
  if (!after) return false;
  let next: PMNode = after;
  while (!next.isTextblock) {
    if (next.type.spec.isolating || !next.firstChild) return false;
    next = next.firstChild;
  }
  if (next.type.spec.code) return false;
  const inItem = !!findListItem($cursor);
  if (!inItem) {
    // From a paragraph into a list: only when the first item is just a line
    // of text, so nothing is left behind in an empty item.
    if (!isListNode(after) || after.firstChild!.childCount > 1) return false;
  }
  return joinTextblockForward(state, dispatch, view);
};

// ── Toggling list types ───────────────────────────────────────────

/**
 * The depth of the list the selection is in, when it is in one: the
 * innermost list holding both ends, reached through items only (a paragraph
 * inside a quote inside an item is not "in the list").
 */
function selectionListDepth($from: ResolvedPos, $to: ResolvedPos): number | null {
  for (let d = $from.sharedDepth($to.pos); d > 0; d--) {
    const node = $from.node(d);
    if (isListNode(node)) return d;
    if (!isListItemNode(node) && !node.isTextblock) return null;
  }
  return null;
}

const canLeadItem = (node: PMNode) => !!node.type.spec.group?.split(' ').includes('list_lead');

/**
 * Bullet, numbered and task list buttons and shortcuts.
 *
 * - In a list of this type: the selected items become paragraphs again.
 * - In a list of another type: the list changes type, keeping its items,
 *   nesting and attributes (a task's checked state is dropped).
 * - Otherwise every paragraph and heading in the selection becomes an item,
 *   and lists in the selection change type; everything ends up in one list,
 *   which joins a matching list right before or after it.
 */
export function toggleListCommand(kind: ListKind): Command {
  return (state, dispatch) => {
    const listType = state.schema.nodes[kind];
    if (!listType) return false;
    const { $from, $to } = state.selection;
    const listDepth = selectionListDepth($from, $to);

    if (listDepth !== null) {
      const ctx = findListItem(state.doc.resolve($from.start(listDepth + 1)));
      if (!ctx) return false;
      if (ctx.list.type === listType) {
        const [fromIdx, toIdx] = selectedItemRange(ctx, $to);
        return unwrapItems(state, dispatch, ctx, fromIdx, toIdx);
      }
      if (dispatch) {
        const bookmark = bookmarkSelection(state);
        const converted = convertList(ctx.list, listType);
        const tr = state.tr.replaceWith(ctx.listPos, ctx.listPos + ctx.list.nodeSize, converted);
        joinAdjacentLists(tr, ctx.listPos, ctx.listPos + converted.nodeSize);
        restoreSelection(tr, bookmark);
        dispatchStructural(dispatch, tr);
      }
      return true;
    }

    const range = $from.blockRange($to);
    if (!range) return false;
    const { parent, startIndex, endIndex } = range;
    const children: PMNode[] = [];
    for (let i = startIndex; i < endIndex; i++) children.push(parent.child(i));

    const itemType = itemTypeOf(listType);
    const nodes: PMNode[] = [];
    let changed = false;
    if (children.every((child) => child.type === listType)) {
      // Everything selected is already this kind of list: back to paragraphs.
      for (const list of children) list.forEach((item) => item.forEach((b) => nodes.push(b)));
      changed = true;
    } else {
      let items: PMNode[] = [];
      let attrs: Attrs | null = null;
      const flush = () => {
        if (items.length) nodes.push(listType.create(attrs, items));
        items = [];
        attrs = null;
      };
      for (const child of children) {
        if (isListNode(child)) {
          attrs ??= child.attrs;
          child.forEach((item) => items.push(convertListItem(item, itemType)));
          changed ||= child.type !== listType;
        } else if (canLeadItem(child)) {
          items.push(itemType.create(null, child));
          changed = true;
        } else {
          flush();
          nodes.push(child);
        }
      }
      flush();
    }
    if (!changed || !parent.canReplace(startIndex, endIndex, Fragment.from(nodes))) return false;
    if (dispatch) {
      const bookmark = bookmarkSelection(state);
      const tr = state.tr.replaceWith(range.start, range.end, nodes);
      const end = range.start + nodes.reduce((size, n) => size + n.nodeSize, 0);
      joinAdjacentLists(tr, range.start, end);
      restoreSelection(tr, bookmark);
      dispatchStructural(dispatch, tr);
    }
    return true;
  };
}

// ── Moving items ──────────────────────────────────────────────────

/** Alt+Shift+Up / Alt+Shift+Down: moves the selected items past their neighbor. */
export function moveListItemCommand(direction: 'up' | 'down'): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    const ctx = findListItem($from);
    if (!ctx) return false;
    const [fromIdx, toIdx] = selectedItemRange(ctx, $to);
    const { list, listPos } = ctx;
    if (direction === 'up' ? fromIdx === 0 : toIdx === list.childCount - 1) return false;
    if (dispatch) {
      const start = itemPosAt(list, listPos, fromIdx);
      const end = itemPosAt(list, listPos, toIdx + 1);
      const tr = state.tr;
      if (direction === 'up') {
        const neighbor = list.child(fromIdx - 1);
        tr.delete(start - neighbor.nodeSize, start);
        tr.insert(tr.mapping.map(end), neighbor);
      } else {
        const neighbor = list.child(toIdx + 1);
        tr.delete(end, end + neighbor.nodeSize);
        tr.insert(start, neighbor);
      }
      dispatchStructural(dispatch, tr);
    }
    return true;
  };
}

// ── Task lists ────────────────────────────────────────────────────

/**
 * Mod-Enter: checks or unchecks the tasks the selection touches (unchecks
 * when they are all checked). Only a task's own text counts, so the cursor
 * in a subtask does not toggle the task around it.
 */
export const toggleTaskCheckedCommand: Command = (state, dispatch) => {
  const { from, to, $from } = state.selection;
  if ($from.parent.type.spec.code) return false;
  const positions: number[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'task_item' || !node.firstChild) return true;
    const leadEnd = pos + 1 + node.firstChild.nodeSize;
    if (from <= leadEnd && to >= pos + 1) positions.push(pos);
    return true;
  });
  if (!positions.length) return false;
  if (dispatch) {
    const check = !positions.every((pos) => state.doc.nodeAt(pos)!.attrs['checked']);
    const tr = state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, 'checked', check);
    dispatchStructural(dispatch, tr);
  }
  return true;
};

// ── Numbered lists and styles ─────────────────────────────────────

/** The innermost list of type `kind` around the selection, with the item index. */
function innermostList(state: EditorState, kind: ListKind): ListItemContext | null {
  let ctx = findListItem(state.selection.$from);
  while (ctx && ctx.list.type.name !== kind) {
    ctx = ctx.listDepth > 1 ? findListItem(state.doc.resolve(ctx.listPos)) : null;
  }
  return ctx;
}

/**
 * Restarts the numbering at `start` from the item at the cursor: sets the
 * list's start when it is the first item, otherwise splits the list there.
 */
export function setListStartCommand(start: number): Command {
  return (state, dispatch) => {
    const ctx = innermostList(state, 'ordered_list');
    if (!ctx) return false;
    const order = sanitizeListStart(start);
    const { list, listPos, index } = ctx;
    if (index === 0) {
      if (sanitizeListStart(list.attrs['order']) === order) return false;
      if (dispatch) {
        dispatchStructural(dispatch, state.tr.setNodeAttribute(listPos, 'order', order));
      }
      return true;
    }
    if (dispatch) {
      const items: PMNode[] = [];
      list.forEach((item) => items.push(item));
      const nodes = [
        list.copy(Fragment.from(items.slice(0, index))),
        list.type.create({ ...list.attrs, order }, items.slice(index)),
      ];
      const bookmark = bookmarkSelection(state);
      const tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, nodes);
      restoreSelection(tr, bookmark);
      dispatchStructural(dispatch, tr.setMeta(SKIP_LIST_JOIN, true));
    }
    return true;
  };
}

/** Restarts the numbering at 1 from the item at the cursor. */
export const restartListNumberingCommand: Command = (state, dispatch, view) =>
  setListStartCommand(1)(state, dispatch, view);

/** The numbered list before the one at the cursor, in the same parent block. */
function previousOrderedList(state: EditorState, ctx: ListItemContext): PMNode | null {
  const $list = state.doc.resolve(ctx.listPos);
  for (let i = $list.index() - 1; i >= 0; i--) {
    const node = $list.parent.child(i);
    if (node.type === ctx.list.type) return node;
  }
  return null;
}

/**
 * Continues the numbering of the previous numbered list (across the
 * paragraphs between them); a list right after it joins it.
 */
export const continueListNumberingCommand: Command = (state, dispatch) => {
  const ctx = innermostList(state, 'ordered_list');
  if (!ctx) return false;
  const previous = previousOrderedList(state, ctx);
  if (!previous) return false;
  const order = sanitizeListStart(previous.attrs['order']) + previous.childCount;
  if (sanitizeListStart(ctx.list.attrs['order']) === order) return false;
  if (dispatch) {
    const tr = state.tr.setNodeAttribute(ctx.listPos, 'order', order);
    joinAdjacentLists(tr, ctx.listPos, ctx.listPos);
    dispatchStructural(dispatch, tr);
  }
  return true;
};

/** Sets the bullet style of the bullet list at the cursor (null: by depth). */
export function setBulletStyleCommand(style: string | null): Command {
  return (state, dispatch) => {
    const ctx = innermostList(state, 'bullet_list');
    if (!ctx) return false;
    const value = style === null ? null : sanitizeBulletStyle(style);
    if (style !== null && value === null) return false;
    if (dispatch) {
      dispatchStructural(dispatch, state.tr.setNodeAttribute(ctx.listPos, 'bulletStyle', value));
    }
    return true;
  };
}

/** Sets the number style of the numbered list at the cursor (null: by depth). */
export function setNumberStyleCommand(style: NumberStyle | null): Command {
  return (state, dispatch) => {
    const ctx = innermostList(state, 'ordered_list');
    if (!ctx) return false;
    const value = style === null ? null : sanitizeNumberStyle(style);
    if (style !== null && value === null) return false;
    if (dispatch) {
      dispatchStructural(dispatch, state.tr.setNodeAttribute(ctx.listPos, 'numberStyle', value));
    }
    return true;
  };
}

// ── State for toolbars ────────────────────────────────────────────

/** The list at the cursor, as toolbars show it. */
export interface ListState {
  kind: ListKind;
  /** Nesting level, 1 for a top-level list. */
  level: number;
  order: number;
  /** The number shown on the item at the cursor (numbered lists). */
  itemNumber: number;
  bulletStyle: string | null;
  numberStyle: NumberStyle | null;
  canIndent: boolean;
  canOutdent: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** A numbered list that can continue an earlier one. */
  canContinue: boolean;
  /** A numbered list whose numbering can restart at the cursor's item. */
  canRestart: boolean;
}

export function listStateAt(state: EditorState): ListState | null {
  const ctx = findListItem(state.selection.$from);
  if (!ctx) return null;
  const kind = ctx.list.type.name as ListKind;
  const ordered = innermostList(state, 'ordered_list');
  return {
    kind,
    level: listLevel(state.selection.$from, ctx.listDepth),
    order: sanitizeListStart(ctx.list.attrs['order']),
    itemNumber: sanitizeListStart(ctx.list.attrs['order']) + ctx.index,
    bulletStyle: sanitizeBulletStyle(ctx.list.attrs['bulletStyle']),
    numberStyle: sanitizeNumberStyle(ctx.list.attrs['numberStyle']),
    canIndent: canSinkListItem(state),
    canOutdent: liftListItemCommand(state),
    canMoveUp: moveListItemCommand('up')(state),
    canMoveDown: moveListItemCommand('down')(state),
    canContinue: !!ordered && continueListNumberingCommand(state),
    canRestart: !!ordered && restartListNumberingCommand(state),
  };
}

export function sameListState(a: ListState | null, b: ListState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (Object.keys(a) as (keyof ListState)[]).every((key) => a[key] === b[key]);
}

// ── Keymap ────────────────────────────────────────────────────────

export interface ListKeymapOptions {
  /** Deepest nesting Tab allows. Defaults to MAX_LIST_DEPTH. */
  maxDepth?: number;
}

/**
 * Keys for editing lists. Each command returns false outside lists, so the
 * keys keep their usual meaning elsewhere (Tab still moves between table
 * cells, Enter still splits paragraphs).
 */
export function listKeymap(options: ListKeymapOptions = {}): Record<string, Command> {
  return {
    Enter: splitListItemCommand,
    Tab: sinkListItemCommand(options.maxDepth),
    'Shift-Tab': liftListItemCommand,
    Backspace: listBackspaceCommand,
    'Shift-Backspace': listBackspaceCommand,
    Delete: listDeleteCommand,
    'Mod-Enter': toggleTaskCheckedCommand,
    'Alt-Shift-ArrowUp': moveListItemCommand('up'),
    'Alt-Shift-ArrowDown': moveListItemCommand('down'),
  };
}
