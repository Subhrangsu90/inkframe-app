import { Fragment, Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, Selection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { closeHistory } from 'prosemirror-history';
import {
  MAX_LIST_DEPTH,
  convertListItem,
  findListItem,
  isListItemNode,
  isListNode,
  itemTypeOf,
  listLevelAt,
  nestedListDepth,
} from './list-commands';

/** Where a dragged list item goes. */
export type ListDropTarget =
  /** Into the list at `listPos`, before its item `index` (or at the end). */
  | { kind: 'item'; listPos: number; index: number }
  /** Into a new list nested at the end of the item at `itemPos`. */
  | { kind: 'sublist'; itemPos: number }
  /** Into a new list at block position `pos`, outside any list. */
  | { kind: 'block'; pos: number };

/**
 * Moves the list item at `itemPos`, with everything nested in it, to
 * `target`. The item takes the type of the list it lands in (a bullet item
 * dropped into a task list becomes a task). Returns null when the move is not
 * possible (into the item itself, too deep) or would change nothing.
 */
export function moveListItemTo(
  state: EditorState,
  itemPos: number,
  target: ListDropTarget,
  maxDepth: number = MAX_LIST_DEPTH,
): Transaction | null {
  const { doc } = state;
  const item = doc.nodeAt(itemPos);
  if (!item || !isListItemNode(item)) return null;
  const $item = doc.resolve(itemPos);
  const source = $item.parent;
  if (!isListNode(source)) return null;
  const sourcePos = $item.before();
  const sourceIndex = $item.index();
  const itemEnd = itemPos + item.nodeSize;
  const newList = () => source.type.create({ ...source.attrs, order: 1 }, item);

  let insertPos: number;
  let node: PMNode;
  if (target.kind === 'item') {
    const list = doc.nodeAt(target.listPos);
    if (!list || !isListNode(list) || target.index < 0 || target.index > list.childCount)
      return null;
    const sameSpot =
      target.listPos === sourcePos &&
      (target.index === sourceIndex || target.index === sourceIndex + 1);
    if (sameSpot) return null;
    insertPos = target.listPos + 1;
    for (let i = 0; i < target.index; i++) insertPos += list.child(i).nodeSize;
    node = convertListItem(item, itemTypeOf(list.type));
  } else if (target.kind === 'sublist') {
    const parent = doc.nodeAt(target.itemPos);
    if (!parent || !isListItemNode(parent)) return null;
    insertPos = target.itemPos + parent.nodeSize - 1;
    node = newList();
  } else {
    insertPos = target.pos;
    node = newList();
  }
  if (insertPos > itemPos && insertPos < itemEnd) return null; // into itself

  const $insert = doc.resolve(insertPos);
  if (!$insert.parent.canReplace($insert.index(), $insert.index(), Fragment.from(node)))
    return null;
  const level = listLevelAt($insert) + (target.kind === 'item' ? 0 : 1);
  if (level + nestedListDepth(item) > maxDepth) return null;

  const tr = state.tr.insert(insertPos, node);
  if (source.childCount === 1) {
    // The item was the list's only one: remove the list too.
    const from = tr.mapping.map(sourcePos);
    const to = tr.mapping.map(sourcePos + source.nodeSize);
    const $from = tr.doc.resolve(from);
    if ($from.parent.canReplace($from.index(), $from.index() + 1)) tr.delete(from, to);
    else tr.replaceWith(from, to, state.schema.nodes['paragraph'].create());
  } else {
    tr.delete(tr.mapping.map(itemPos), tr.mapping.map(itemEnd));
  }
  const placed = tr.mapping.slice(1).map(insertPos);
  tr.setSelection(Selection.findFrom(tr.doc.resolve(placed), 1, false) ?? tr.selection);
  return closeHistory(tr).scrollIntoView();
}

// ── Drag handle ───────────────────────────────────────────────────

export const listDragKey = new PluginKey<DecorationSet>('list-drag');

/** Pixels right of an item's text where a drop nests under that item. */
const NEST_OFFSET = 32;
const HANDLE_WIDTH = 14;
const HANDLE_HEIGHT = 20;

interface DropResult {
  target: ListDropTarget;
  /** Where to draw the drop line, in viewport coordinates. */
  line: { left: number; top: number; width: number };
}

const rectOf = (view: EditorView, pos: number) =>
  (view.nodeDOM(pos) as HTMLElement | null)?.getBoundingClientRect?.() ?? null;

/** The drop target under the pointer while dragging the item at `sourcePos`. */
function dropTargetAt(
  view: EditorView,
  x: number,
  y: number,
  sourcePos: number,
  source: PMNode,
): DropResult | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const { doc } = view.state;
  const $pos = doc.resolve(hit.pos);
  const ctx = findListItem($pos);

  if (ctx) {
    if (ctx.itemPos >= sourcePos && ctx.itemPos < sourcePos + source.nodeSize) return null;
    const itemRect = rectOf(view, ctx.itemPos);
    const lead = rectOf(view, ctx.itemPos + 1);
    if (!itemRect || !lead) return null;
    if (y < lead.top + lead.height / 2) {
      return {
        target: { kind: 'item', listPos: ctx.listPos, index: ctx.index },
        line: { left: itemRect.left, top: itemRect.top, width: itemRect.width },
      };
    }
    const second = ctx.item.childCount > 1 ? ctx.item.child(1) : null;
    if (isListNode(second)) {
      // Just below an item with children: first among them.
      const nestedPos = ctx.itemPos + 1 + ctx.item.child(0).nodeSize;
      const first = rectOf(view, nestedPos + 1) ?? lead;
      return {
        target: { kind: 'item', listPos: nestedPos, index: 0 },
        line: { left: first.left, top: first.top, width: first.width },
      };
    }
    if (x > lead.left + NEST_OFFSET && ctx.item.childCount === 1) {
      return {
        target: { kind: 'sublist', itemPos: ctx.itemPos },
        line: { left: lead.left + NEST_OFFSET, top: lead.bottom, width: lead.width - NEST_OFFSET },
      };
    }
    // After the item; left of a last item's list, after the item around it.
    let at = ctx;
    for (;;) {
      if (at.index !== at.list.childCount - 1) break;
      const listRect = rectOf(view, at.listPos);
      const outer = findListItem(doc.resolve(at.listPos));
      if (!listRect || !outer || x >= listRect.left) break;
      at = outer;
    }
    const r = rectOf(view, at.itemPos);
    if (!r) return null;
    return {
      target: { kind: 'item', listPos: at.listPos, index: at.index + 1 },
      line: { left: r.left, top: r.bottom, width: r.width },
    };
  }

  // Outside lists: before or after the block under the pointer.
  if (!$pos.parent.isTextblock || $pos.depth < 1) return null;
  const blockPos = $pos.before();
  const r = rectOf(view, blockPos);
  if (!r) return null;
  const before = y < r.top + r.height / 2;
  return {
    target: { kind: 'block', pos: before ? blockPos : blockPos + $pos.parent.nodeSize },
    line: { left: r.left, top: before ? r.top : r.bottom, width: r.width },
  };
}

/** Places an absolutely positioned element at viewport coordinates. */
function place(el: HTMLElement, left: number, top: number): boolean {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return false;
  const r = parent.getBoundingClientRect();
  el.style.left = `${left - r.left - parent.clientLeft + parent.scrollLeft}px`;
  el.style.top = `${top - r.top - parent.clientTop + parent.scrollTop}px`;
  return true;
}

class ListDragView {
  private readonly handle: HTMLElement;
  private readonly line: HTMLElement;
  private hovered: { pos: number; dom: HTMLElement } | null = null;
  private dragging: { pos: number; node: PMNode } | null = null;
  private target: ListDropTarget | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.handle = doc.createElement('div');
    this.handle.className = 'ink-list-drag-handle';
    this.handle.draggable = true;
    this.handle.title = 'Drag to move';
    // Mouse only: keyboard users move items with Alt+Shift+Up and Down.
    this.handle.setAttribute('aria-hidden', 'true');
    this.line = doc.createElement('div');
    this.line.className = 'ink-list-drop-line';
    view.dom.parentElement?.append(this.handle, this.line);

    this.listen(view.dom, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.listen(view.dom, 'mouseleave', (e) => {
      if ((e as MouseEvent).relatedTarget !== this.handle) this.hideHandle();
    });
    this.listen(this.handle, 'mouseleave', (e) => {
      const to = (e as MouseEvent).relatedTarget as Node | null;
      if (!this.dragging && !(to && this.view.dom.contains(to))) this.hideHandle();
    });
    this.listen(this.handle, 'dragstart', (e) => this.onDragStart(e as DragEvent));
    this.listen(this.handle, 'dragend', () => this.endDrag());
    if (doc.defaultView) {
      // The handle does not scroll with the text.
      this.listen(doc.defaultView, 'scroll', () => !this.dragging && this.hideHandle(), true);
    }
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void, capture = false) {
    target.addEventListener(type, handler, capture);
    this.cleanups.push(() => target.removeEventListener(type, handler, capture));
  }

  get isDragging(): boolean {
    return !!this.dragging;
  }

  update(view: EditorView, prev: EditorState): void {
    this.view = view;
    if (!view.editable || (!this.dragging && !view.state.doc.eq(prev.doc))) this.hideHandle();
  }

  destroy(): void {
    this.cleanups.forEach((cleanup) => cleanup());
    this.handle.remove();
    this.line.remove();
  }

  private hideHandle(): void {
    this.hovered = null;
    this.handle.classList.remove('is-visible');
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.dragging || !this.view.editable) return;
    const hit = this.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const ctx = hit ? findListItem(this.view.state.doc.resolve(hit.pos)) : null;
    const dom = ctx && (this.view.nodeDOM(ctx.itemPos) as HTMLElement | null);
    const lead = ctx && (this.view.nodeDOM(ctx.itemPos + 1) as HTMLElement | null);
    if (!ctx || !dom || !lead?.getBoundingClientRect) return this.hideHandle();
    this.hovered = { pos: ctx.itemPos, dom };
    const item = dom.getBoundingClientRect();
    const text = lead.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(lead).lineHeight) || text.height;
    // Task boxes sit inside the item; bullets and numbers hang outside it.
    const gutter = ctx.item.type.name === 'task_item' ? 4 : 22;
    const top = text.top + Math.max(0, (Math.min(lineHeight, text.height) - HANDLE_HEIGHT) / 2);
    if (place(this.handle, item.left - gutter - HANDLE_WIDTH, top)) {
      this.handle.classList.add('is-visible');
    }
  }

  private onDragStart(e: DragEvent): void {
    const hovered = this.hovered;
    const node = hovered && this.view.state.doc.nodeAt(hovered.pos);
    if (!hovered || !node || !e.dataTransfer || !isListItemNode(node)) {
      e.preventDefault();
      return;
    }
    this.dragging = { pos: hovered.pos, node };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.textContent);
    e.dataTransfer.setDragImage(hovered.dom, 0, 0);
    // After the browser has taken its picture of the item.
    setTimeout(() => {
      if (this.dragging?.pos === hovered.pos) {
        this.view.dispatch(this.view.state.tr.setMeta(listDragKey, { source: hovered.pos }));
      }
    });
  }

  /** dragover: finds the target under the pointer and draws the drop line. */
  dragOver(x: number, y: number): void {
    const source = this.dragging;
    const result = source && dropTargetAt(this.view, x, y, source.pos, source.node);
    const valid = !!result && !!moveListItemTo(this.view.state, source!.pos, result.target);
    this.target = valid ? result!.target : null;
    if (valid && place(this.line, result!.line.left, result!.line.top - 1)) {
      this.line.style.width = `${Math.max(result!.line.width, 24)}px`;
      this.line.classList.add('is-visible');
    } else {
      this.line.classList.remove('is-visible');
    }
  }

  hideLine(): void {
    this.target = null;
    this.line.classList.remove('is-visible');
  }

  drop(x: number, y: number): void {
    this.dragOver(x, y);
    const source = this.dragging;
    const target = this.target;
    this.endDrag();
    if (!source || !target || this.view.state.doc.nodeAt(source.pos) !== source.node) return;
    const tr = moveListItemTo(this.view.state, source.pos, target);
    if (tr) {
      this.view.dispatch(tr.setMeta('uiEvent', 'drop'));
      this.view.focus();
    }
  }

  endDrag(): void {
    const wasDragging = !!this.dragging;
    this.dragging = null;
    this.hideLine();
    this.hideHandle();
    if (wasDragging || listDragKey.getState(this.view.state) !== DecorationSet.empty) {
      this.view.dispatch(this.view.state.tr.setMeta(listDragKey, { source: null }));
    }
  }
}

/**
 * A handle beside the list item under the mouse. Dragging it moves the item
 * and its nested items: between items, into a nested list (drop to the right
 * of an item's text) or out of one (drop to the left of a nested list), or
 * out of the list altogether. A line shows where the item will land.
 */
export function listDragPlugin(): Plugin<DecorationSet> {
  const views = new WeakMap<EditorView, ListDragView>();
  return new Plugin<DecorationSet>({
    key: listDragKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        const meta = tr.getMeta(listDragKey) as { source: number | null } | undefined;
        if (meta) {
          const node = meta.source === null ? null : tr.doc.nodeAt(meta.source);
          return node
            ? DecorationSet.create(tr.doc, [
                Decoration.node(meta.source!, meta.source! + node.nodeSize, {
                  class: 'ink-list-drag-source',
                }),
              ])
            : DecorationSet.empty;
        }
        return set.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations: (state) => listDragKey.getState(state),
      handleDOMEvents: {
        dragover(view, event) {
          const dragView = views.get(view);
          if (!dragView?.isDragging) return false;
          event.preventDefault();
          // Our line replaces ProseMirror's drop cursor for list items.
          event.stopImmediatePropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          dragView.dragOver(event.clientX, event.clientY);
          return true;
        },
        dragleave(view, event) {
          const dragView = views.get(view);
          const to = event.relatedTarget as Node | null;
          if (dragView?.isDragging && !(to && view.dom.contains(to))) dragView.hideLine();
          return false;
        },
        drop(view, event) {
          const dragView = views.get(view);
          if (!dragView?.isDragging) return false;
          event.preventDefault();
          event.stopImmediatePropagation();
          dragView.drop(event.clientX, event.clientY);
          return true;
        },
      },
    },
    view(editorView) {
      const dragView = new ListDragView(editorView);
      views.set(editorView, dragView);
      return dragView;
    },
  });
}
