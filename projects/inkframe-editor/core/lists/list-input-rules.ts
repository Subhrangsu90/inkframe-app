import { InputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { Fragment, Node as PMNode, NodeType } from 'prosemirror-model';
import { TextSelection, Transaction } from 'prosemirror-state';
import { findWrapping } from 'prosemirror-transform';

/** `- `, `* ` or `+ ` at the start of a paragraph or heading starts a bullet list. */
export function bulletListRule(type: NodeType): InputRule {
  return wrappingInputRule(/^\s*([-+*])\s$/, type);
}

/**
 * `1. ` or `1) ` (any number) starts a numbered list at that number. Right
 * after a numbered list it continues that list when the number follows on.
 */
export function orderedListRule(type: NodeType): InputRule {
  return wrappingInputRule(
    /^(\d+)[.)]\s$/,
    type,
    (match) => ({ order: +match[1] }),
    (match, node) => node.childCount + (node.attrs['order'] as number) === +match[1],
  );
}

/**
 * Turns the bullet item at `index` of the list at `listPos` into a task: the
 * list is split around it and the task gets a task list of its own (which the
 * list-join plugin merges with a task list next to it).
 */
function bulletItemToTask(
  tr: Transaction,
  listPos: number,
  index: number,
  checked: boolean,
): Transaction | null {
  const { task_list, task_item } = tr.doc.type.schema.nodes;
  const list = tr.doc.nodeAt(listPos)!;
  const items: PMNode[] = [];
  list.forEach((item) => items.push(item));
  const task = task_list.create(null, task_item.create({ checked }, items[index].content));
  const nodes: PMNode[] = [];
  if (index > 0) nodes.push(list.copy(Fragment.from(items.slice(0, index))));
  nodes.push(task);
  if (index < items.length - 1) nodes.push(list.type.create(list.attrs, items.slice(index + 1)));
  const taskPos = listPos + (index > 0 ? nodes[0].nodeSize : 0);
  tr.replaceWith(listPos, listPos + list.nodeSize, nodes);
  // Inside the task list, the task item and its first textblock.
  return tr.setSelection(TextSelection.create(tr.doc, taskPos + 3));
}

/**
 * `[ ] ` or `[x] ` at the start of a paragraph starts a task list (checked
 * for `[x]`). In a task it sets the task's checked state, and at the start of
 * a bullet item (`- [ ] `, as on GitHub) it turns the item into a task.
 */
export function taskItemRule(): InputRule {
  return new InputRule(/^\s*\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const isChecked = match[1].toLowerCase() === 'x';
    // Use the state's schema: types from another Schema instance never match.
    const { task_list, task_item, list_item, bullet_list } = state.schema.nodes;
    if (!task_list || !task_item) return null;
    const tr = state.tr.delete(start, end);
    const $pos = tr.doc.resolve(tr.mapping.map(start));
    const range = $pos.blockRange();
    if (!range) return null;

    if ($pos.depth > 1 && $pos.node($pos.depth - 1).type === task_item) {
      const itemPos = $pos.before($pos.depth - 1);
      return tr.setNodeAttribute(itemPos, 'checked', isChecked);
    }

    const itemDepth = $pos.depth - 1;
    if (
      itemDepth >= 2 &&
      list_item &&
      bullet_list &&
      $pos.index(itemDepth) === 0 &&
      $pos.node(itemDepth).type === list_item &&
      $pos.node(itemDepth - 1).type === bullet_list
    ) {
      return bulletItemToTask(tr, $pos.before(itemDepth - 1), $pos.index(itemDepth - 1), isChecked);
    }

    const wrapping = findWrapping(range, task_list);
    if (!wrapping) return null;

    const wrappers = wrapping.map((w) =>
      w.type === task_item ? { type: w.type, attrs: { checked: isChecked } } : w,
    );

    return tr.wrap(range, wrappers);
  });
}
