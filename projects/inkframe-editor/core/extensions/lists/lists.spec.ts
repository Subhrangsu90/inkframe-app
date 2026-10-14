import { describe, it, expect } from 'vitest';
import { Node as PMNode } from 'prosemirror-model';
import { Command, EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { liftListItem, splitListItem } from 'prosemirror-schema-list';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { cleanPastedHtml } from '../paste-cleanup/paste-cleanup';
import { TaskItemNodeView } from './task-item.node-view';
import {
  MAX_LIST_DEPTH,
  SKIP_LIST_JOIN,
  continueListNumberingCommand,
  deleteSelectedListItemsCommand,
  liftListItemCommand,
  listBackspaceCommand,
  listDeleteCommand,
  listStateAt,
  moveListItemCommand,
  restartListNumberingCommand,
  setBulletStyleCommand,
  setListStartCommand,
  setNumberStyleCommand,
  sinkListItemCommand,
  splitListItemCommand,
  toggleListCommand,
  toggleTaskCheckedCommand,
} from './list-commands';
import { listJoinPlugin } from './list-join.plugin';
import { moveListItemTo } from './list-drag.plugin';
import { bulletListRule, orderedListRule, taskItemRule } from './list-input-rules';
import { isTaskIndeterminate, sanitizeBulletStyle } from './list-schema';

// ── Builders ──────────────────────────────────────────────────────

const N = schema.nodes;
const p = (text = '') => N['paragraph'].create(null, text ? schema.text(text) : null);
const h = (text: string) => N['heading'].create({ level: 2 }, schema.text(text));
const li = (...content: PMNode[]) => N['list_item'].create(null, content);
const ti = (checked: boolean, ...content: PMNode[]) => N['task_item'].create({ checked }, content);
const ul = (...items: PMNode[]) => N['bullet_list'].create(null, items);
const ol = (order: number, ...items: PMNode[]) => N['ordered_list'].create({ order }, items);
const tl = (...items: PMNode[]) => N['task_list'].create(null, items);
const doc = (...content: PMNode[]) => N['doc'].create(null, content);
/** A bullet item holding one paragraph. */
const b = (text: string, ...rest: PMNode[]) => li(p(text), ...rest);

/** Position at the start (or end) of the first textblock with this text. */
function posOf(d: PMNode, text: string, where: 'start' | 'end' = 'start'): number {
  let found = -1;
  d.descendants((node, pos) => {
    if (found < 0 && node.isTextblock && node.textContent === text) {
      found = where === 'start' ? pos + 1 : pos + 1 + node.content.size;
    }
    return found < 0;
  });
  if (found < 0) throw new Error(`no textblock "${text}"`);
  return found;
}

function stateAt(
  d: PMNode,
  text: string,
  where: 'start' | 'end' = 'start',
  plugins: Plugin[] = [],
): EditorState {
  return EditorState.create({
    doc: d,
    selection: TextSelection.create(d, posOf(d, text, where)),
    plugins,
  });
}

function stateBetween(d: PMNode, from: string, to: string, plugins: Plugin[] = []): EditorState {
  return EditorState.create({
    doc: d,
    selection: TextSelection.create(d, posOf(d, from), posOf(d, to, 'end')),
    plugins,
  });
}

/** Runs a command that must apply; returns the new state. */
function run(state: EditorState, command: Command): EditorState {
  let next: EditorState | null = null;
  const handled = command(state, (tr) => (next = state.apply(tr)));
  expect(handled).toBe(true);
  expect(next).not.toBeNull();
  return next!;
}

const shape = (state: EditorState) => state.doc.toString();
const textAtCursor = (state: EditorState) => state.selection.$from.parent.textContent;

// ── The nested-item bug ───────────────────────────────────────────

describe('List keys act on the innermost item (bullets inside a task)', () => {
  const nested = (last: PMNode) =>
    doc(tl(ti(false, p('Task1')), ti(true, p('Task2'), ul(b('x'), last))));

  it('Enter on an empty nested bullet outdents it next to the task, not the task itself', () => {
    const next = run(stateAt(nested(li(p())), ''), splitListItemCommand);
    const tasks = next.doc.firstChild!;
    expect(tasks.type.name).toBe('task_list');
    expect(tasks.childCount).toBe(3);
    expect(tasks.child(1).attrs['checked']).toBe(true); // the parent task keeps its state
    expect(tasks.child(1).textContent).toBe('Task2x');
    expect(tasks.child(2).type.name).toBe('task_item'); // the bullet became a task after it
    expect(tasks.child(2).attrs['checked']).toBe(false);
  });

  it('Tab nests the bullet under the bullet before it', () => {
    const next = run(stateAt(nested(b('y')), 'y'), sinkListItemCommand());
    expect(shape(next)).toBe(
      doc(tl(ti(false, p('Task1')), ti(true, p('Task2'), ul(b('x', ul(b('y'))))))).toString(),
    );
    expect(textAtCursor(next)).toBe('y');
  });

  it('Shift-Tab moves the bullet out next to the task, as a task', () => {
    const next = run(stateAt(nested(b('y')), 'y'), liftListItemCommand);
    const tasks = next.doc.firstChild!;
    expect(tasks.childCount).toBe(3);
    expect(tasks.child(1).textContent).toBe('Task2x');
    expect(tasks.child(2).type.name).toBe('task_item');
    expect(tasks.child(2).textContent).toBe('y');
    expect(textAtCursor(next)).toBe('y');
  });

  it('Shift-Tab on a nested task inside a bullet keeps the bullets after it nested under it', () => {
    const d = doc(ul(b('Parent', tl(ti(false, p('a')), ti(false, p('b')), ti(false, p('c'))))));
    const next = run(stateAt(d, 'b'), liftListItemCommand);
    expect(shape(next)).toBe(
      doc(ul(b('Parent', tl(ti(false, p('a')))), b('b', tl(ti(false, p('c')))))).toString(),
    );
  });
});

// ── Toggling ──────────────────────────────────────────────────────

describe('Toggling lists', () => {
  it('turns a heading into a list item (button and "- " shortcut)', () => {
    const next = run(stateAt(doc(h('Title')), 'Title'), toggleListCommand('bullet_list'));
    expect(shape(next)).toBe(doc(ul(li(h('Title')))).toString());

    const d = doc(N['heading'].create({ level: 2 }, schema.text('-')));
    const state = EditorState.create({ doc: d, selection: TextSelection.create(d, 2) });
    const rule = bulletListRule(N['bullet_list']) as any;
    const tr = rule.handler(state, '- '.match(rule.match), 1, 2);
    expect(tr).toBeTruthy();
    expect(state.apply(tr).doc.firstChild!.type.name).toBe('bullet_list');
  });

  it('wraps several paragraphs and lists in the selection into one list', () => {
    const d = doc(p('a'), ul(b('b')), ol(1, b('c')), p('d'));
    const next = run(stateBetween(d, 'a', 'd'), toggleListCommand('task_list'));
    expect(shape(next)).toBe(
      doc(
        tl(ti(false, p('a')), ti(false, p('b')), ti(false, p('c')), ti(false, p('d'))),
      ).toString(),
    );
  });

  it('includes the paragraph after a list when the selection reaches into it', () => {
    const d = doc(ul(b('A')), p('B'));
    const next = run(stateBetween(d, 'A', 'B'), toggleListCommand('bullet_list'));
    expect(shape(next)).toBe(doc(ul(b('A'), b('B'))).toString());
  });

  it('joins a new list to a matching list right before it, so numbering continues', () => {
    const d = doc(ol(1, b('A'), b('B')), p('C'));
    const next = run(stateAt(d, 'C'), toggleListCommand('ordered_list'));
    expect(shape(next)).toBe(doc(ol(1, b('A'), b('B'), b('C'))).toString());
  });

  it('keeps the start number when converting a numbered list to bullets and back', () => {
    let state = stateAt(doc(ol(3, b('A'), b('B'))), 'A');
    state = run(state, toggleListCommand('bullet_list'));
    expect(state.doc.firstChild!.type.name).toBe('bullet_list');
    state = run(state, toggleListCommand('ordered_list'));
    expect(state.doc.firstChild!.attrs['order']).toBe(3);
  });

  it('drops the checked state when a task list becomes a bullet list', () => {
    const next = run(
      stateAt(doc(tl(ti(true, p('done')))), 'done'),
      toggleListCommand('bullet_list'),
    );
    expect(shape(next)).toBe(doc(ul(b('done'))).toString());
  });

  it('toggling off keeps nested content and continues the numbering after it', () => {
    const d = doc(ol(1, b('A'), b('B', ul(b('child'))), b('C')));
    const next = run(stateAt(d, 'B'), toggleListCommand('ordered_list'));
    expect(shape(next)).toBe(doc(ol(1, b('A')), p('B'), ul(b('child')), ol(2, b('C'))).toString());
    expect(next.doc.child(3).attrs['order']).toBe(2);
    expect(textAtCursor(next)).toBe('B');
  });
});

// ── Enter, Tab ────────────────────────────────────────────────────

describe('Enter and Tab', () => {
  it('Enter on an empty item in the middle of a numbered list leaves the list and keeps counting', () => {
    const d = doc(ol(1, b('A'), b('B'), li(p()), b('D'), b('E')));
    const next = run(stateAt(d, ''), splitListItemCommand);
    expect(shape(next)).toBe(doc(ol(1, b('A'), b('B')), p(), ol(3, b('D'), b('E'))).toString());
    expect(next.doc.child(2).attrs['order']).toBe(3);
  });

  it('Tab on the first item is handled without changing anything (focus stays)', () => {
    const state = stateAt(doc(ul(b('A'), b('B'))), 'A');
    let dispatched = false;
    expect(sinkListItemCommand()(state, () => (dispatched = true))).toBe(true);
    expect(dispatched).toBe(false);
  });

  it(`Tab stops at ${MAX_LIST_DEPTH} levels`, () => {
    let item = b('deep');
    for (let i = MAX_LIST_DEPTH - 1; i >= 1; i--) item = b(`L${i}`, ul(item));
    // "deep" is at level MAX_LIST_DEPTH; "top" gives L1 an item to nest under.
    const d = doc(ul(b('top'), item));
    expect(d.check()).toBeUndefined();
    const state = stateAt(d, 'L1');
    // Nesting L1 (which holds MAX_LIST_DEPTH - 1 more levels) would go one level too deep.
    let dispatched = false;
    expect(sinkListItemCommand()(state, () => (dispatched = true))).toBe(true);
    expect(dispatched).toBe(false);
    // A shallow item still nests.
    const shallow = run(stateAt(doc(ul(b('a'), b('b'))), 'b'), sinkListItemCommand());
    expect(shallow.doc.firstChild!.childCount).toBe(1);
  });

  it('Tab still nests within the limit when a custom depth is given', () => {
    const state = stateAt(doc(ul(b('a'), b('b'))), 'b');
    let dispatched = false;
    expect(sinkListItemCommand(1)(state, () => (dispatched = true))).toBe(true);
    expect(dispatched).toBe(false);
  });
});

// ── Backspace and Delete ──────────────────────────────────────────

describe('Backspace', () => {
  it('at the start of a nested item outdents it one level', () => {
    const next = run(stateAt(doc(ul(b('A', ul(b('B'))))), 'B'), listBackspaceCommand);
    expect(shape(next)).toBe(doc(ul(b('A'), b('B'))).toString());
  });

  it('at the start of a top-level item makes it a paragraph; again, joins it to the item before', () => {
    let state = stateAt(doc(ol(1, b('A'), b('B'), b('C'))), 'B');
    state = run(state, listBackspaceCommand);
    expect(shape(state)).toBe(doc(ol(1, b('A')), p('B'), ol(2, b('C'))).toString());
    expect(state.doc.child(2).attrs['order']).toBe(2);
    state = run(state, listBackspaceCommand);
    expect(shape(state)).toBe(doc(ol(1, b('AB')), ol(2, b('C'))).toString());
    expect(state.selection.from).toBe(posOf(state.doc, 'AB') + 1);
  });

  it('then the join plugin merges the two halves back into one list', () => {
    let state = stateAt(doc(ol(1, b('A'), b('B'), b('C'))), 'B', 'start', [listJoinPlugin()]);
    state = run(state, listBackspaceCommand);
    state = run(state, listBackspaceCommand);
    expect(shape(state)).toBe(doc(ol(1, b('AB'), b('C'))).toString());
  });

  it('removes whole selected items instead of leaving an empty one', () => {
    const d = doc(ul(b('A'), b('B'), b('C'), b('D')));
    const next = run(stateBetween(d, 'B', 'C'), listBackspaceCommand);
    expect(shape(next)).toBe(doc(ul(b('A'), b('D'))).toString());
    expect(textAtCursor(next)).toBe('A');
  });

  it('removes the whole list when every item is selected', () => {
    const d = doc(p('before'), ul(b('A'), b('B')));
    const next = run(stateBetween(d, 'A', 'B'), deleteSelectedListItemsCommand);
    expect(shape(next)).toBe(doc(p('before'), p()).toString());
  });

  it('leaves partial selections to the normal deletion', () => {
    const d = doc(ul(b('Apple'), b('Banana')));
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, posOf(d, 'Apple') + 2, posOf(d, 'Banana', 'end')),
    });
    expect(deleteSelectedListItemsCommand(state)).toBe(false);
  });
});

describe('Delete', () => {
  it('at the end of an item joins the next item, with what is nested in it', () => {
    const d = doc(ul(b('A'), b('B', ul(b('C')))));
    const next = run(stateAt(d, 'A', 'end'), listDeleteCommand);
    expect(shape(next)).toBe(doc(ul(b('AB', ul(b('C'))))).toString());
  });

  it('at the end of the last item joins the paragraph after the list', () => {
    const next = run(stateAt(doc(ul(b('A')), p('Next')), 'A', 'end'), listDeleteCommand);
    expect(shape(next)).toBe(doc(ul(b('ANext'))).toString());
  });

  it('at the end of a paragraph joins a plain first item, but not one with nested items', () => {
    const plain = run(stateAt(doc(p('P'), ul(b('A'), b('B'))), 'P', 'end'), listDeleteCommand);
    expect(shape(plain)).toBe(doc(p('PA'), ul(b('B'))).toString());
    const nested = stateAt(doc(p('P'), ul(b('A', ul(b('C'))))), 'P', 'end');
    expect(listDeleteCommand(nested)).toBe(false);
  });
});

// ── Joining adjacent lists ────────────────────────────────────────

describe('Joining adjacent lists', () => {
  const withPlugins = (d: PMNode, text: string) =>
    stateAt(d, text, 'start', [history(), listJoinPlugin()]);

  it('merges a task list typed right below another', () => {
    const d = doc(tl(ti(false, p('A'))), p('[ ]'));
    const state = EditorState.create({
      doc: d,
      selection: TextSelection.create(d, posOf(d, '[ ]', 'end')),
      plugins: [listJoinPlugin()],
    });
    const rule = taskItemRule() as any;
    const start = posOf(d, '[ ]');
    const tr = rule.handler(state, '[ ] '.match(rule.match), start, start + 3);
    const next = state.apply(tr);
    expect(shape(next)).toBe(doc(tl(ti(false, p('A')), ti(false, p()))).toString());
  });

  it('merges two lists when the paragraph between them is deleted', () => {
    const state = withPlugins(doc(ul(b('A')), p(), ul(b('B'))), '');
    const next = run(state, listBackspaceCommand);
    expect(shape(next)).toBe(doc(ul(b('A'), b('B'))).toString());
  });

  it('keeps lists apart when the edit says so, and when their styles differ', () => {
    const state = withPlugins(doc(ul(b('A')), p('x')), 'x');
    const split = state.apply(
      state.tr
        .replaceWith(posOf(state.doc, 'x') - 1, state.doc.content.size, ul(b('B')))
        .setMeta(SKIP_LIST_JOIN, true),
    );
    expect(split.doc.childCount).toBe(2);

    const squares = N['bullet_list'].create({ bulletStyle: 'square' }, [b('B')]);
    const styled = withPlugins(doc(ul(b('A')), p(), squares), '');
    expect(run(styled, listBackspaceCommand).doc.childCount).toBe(2);
  });

  it('undo restores the lists exactly, joined or not', () => {
    const state = withPlugins(doc(ul(b('A')), p(), ul(b('B'))), '');
    const joined = run(state, listBackspaceCommand);
    const back = run(joined, undo);
    expect(back.doc.eq(state.doc)).toBe(true);
  });
});

// ── Numbered lists ────────────────────────────────────────────────

describe('Numbered lists', () => {
  it('restarts the numbering at the item at the cursor, and the join plugin leaves it apart', () => {
    const d = doc(ol(1, b('A'), b('B'), b('C')));
    const state = stateAt(d, 'B', 'start', [listJoinPlugin()]);
    const next = run(state, restartListNumberingCommand);
    expect(shape(next)).toBe(doc(ol(1, b('A')), ol(1, b('B'), b('C'))).toString());
    expect(next.doc.child(1).attrs['order']).toBe(1);
  });

  it('sets the start number of the first item, and continues earlier numbering', () => {
    const d = doc(ol(1, b('A'), b('B')), p('between'), ol(1, b('C')));
    let state = stateAt(d, 'C');
    state = run(state, setListStartCommand(7));
    expect(state.doc.child(2).attrs['order']).toBe(7);
    state = run(state, continueListNumberingCommand);
    expect(state.doc.child(2).attrs['order']).toBe(3);
    expect(continueListNumberingCommand(state)).toBe(false); // already continuing
  });

  it('"1) " starts a list at that number; "3. " after a two-item list continues it', () => {
    const rule = orderedListRule(N['ordered_list']) as any;
    const d = doc(p('5)'));
    const state = EditorState.create({ doc: d, selection: TextSelection.create(d, 3) });
    const next = state.apply(rule.handler(state, '5) '.match(rule.match), 1, 3));
    expect(next.doc.firstChild!.attrs['order']).toBe(5);

    const d2 = doc(ol(1, b('A'), b('B')), p('3.'));
    const start = posOf(d2, '3.');
    const s2 = EditorState.create({ doc: d2, selection: TextSelection.create(d2, start + 2) });
    const joined = s2.apply(rule.handler(s2, '3. '.match(rule.match), start, start + 2));
    expect(joined.doc.childCount).toBe(1);
    expect(joined.doc.firstChild!.childCount).toBe(3);
  });

  it('sets bullet and number styles, and refuses unsafe custom bullets', () => {
    const bullets = run(stateAt(doc(ul(b('A'))), 'A'), setBulletStyleCommand('square'));
    expect(bullets.doc.firstChild!.attrs['bulletStyle']).toBe('square');
    const custom = run(bullets, setBulletStyleCommand('🍎'));
    expect(custom.doc.firstChild!.attrs['bulletStyle']).toBe('🍎');
    expect(setBulletStyleCommand('"; color: red')(custom)).toBe(false);
    expect(sanitizeBulletStyle('a"b')).toBeNull();

    const numbers = run(stateAt(doc(ol(1, b('A'))), 'A'), setNumberStyleCommand('upper-roman'));
    expect(numbers.doc.firstChild!.attrs['numberStyle']).toBe('upper-roman');
    expect(setNumberStyleCommand('upper-roman')(bullets)).toBe(false); // not a numbered list
  });
});

// ── Task lists ────────────────────────────────────────────────────

describe('Task lists', () => {
  it('Mod-Enter toggles the task at the cursor, not the task around it', () => {
    const d = doc(tl(ti(false, p('parent'), tl(ti(false, p('child'))))));
    const next = run(stateAt(d, 'child'), toggleTaskCheckedCommand);
    expect(next.doc.firstChild!.firstChild!.attrs['checked']).toBe(false);
    expect(next.doc.firstChild!.firstChild!.lastChild!.firstChild!.attrs['checked']).toBe(true);
    expect(toggleTaskCheckedCommand(stateAt(doc(p('x')), 'x'))).toBe(false);
  });

  it('Mod-Enter over several tasks checks them all, then unchecks them all', () => {
    const d = doc(tl(ti(true, p('a')), ti(false, p('b'))));
    let state = run(stateBetween(d, 'a', 'b'), toggleTaskCheckedCommand);
    expect([0, 1].map((i) => state.doc.firstChild!.child(i).attrs['checked'])).toEqual([
      true,
      true,
    ]);
    state = run(state, toggleTaskCheckedCommand);
    expect([0, 1].map((i) => state.doc.firstChild!.child(i).attrs['checked'])).toEqual([
      false,
      false,
    ]);
  });

  it('a task with some (not all) subtasks done is indeterminate, in the view and in HTML', () => {
    const parent = ti(false, p('parent'), tl(ti(true, p('a')), ti(false, p('b'))));
    expect(isTaskIndeterminate(parent)).toBe(true);
    expect(isTaskIndeterminate(ti(false, p('x'), tl(ti(true, p('a')))))).toBe(false);
    expect(isTaskIndeterminate(ti(true, p('x'), tl(ti(true, p('a')), ti(false, p('b')))))).toBe(
      false,
    );

    const view = {
      state: EditorState.create({ schema }),
      dispatch: () => {},
    } as unknown as EditorView;
    const nodeView = new TaskItemNodeView(parent, view, () => 0);
    const box = nodeView.dom.querySelector('input') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box.getAttribute('aria-label')).toBe('Task: parent');
    nodeView.update(ti(false, p('parent'), tl(ti(true, p('a')), ti(true, p('b')))));
    expect(box.indeterminate).toBe(false);

    expect(docToHtml(doc(tl(parent)))).toContain('ink-task-item indeterminate');
  });

  it('a tap anywhere on the checkbox label (the touch target) checks the task', () => {
    const d = doc(tl(ti(false, p('milk'))));
    const view: any = { state: EditorState.create({ doc: d }) };
    view.dispatch = (tr: any) => (view.state = view.state.apply(tr));
    const nodeView = new TaskItemNodeView(d.firstChild!.firstChild!, view, () => 1);
    document.body.append(nodeView.dom);
    const label = nodeView.dom.querySelector('label.ink-task-check') as HTMLLabelElement;
    const box = label.querySelector('input') as HTMLInputElement;

    label.click();
    expect(box.checked).toBe(true);
    expect(view.state.doc.firstChild!.firstChild!.attrs['checked']).toBe(true);
    // ProseMirror leaves the label's events to the node view.
    expect(nodeView.stopEvent(new MouseEvent('mousedown'))).toBe(false);
    const press = new MouseEvent('mousedown');
    Object.defineProperty(press, 'target', { value: label });
    expect(nodeView.stopEvent(press)).toBe(true);
    nodeView.dom.remove();
  });

  it('"- [ ] " at the start of a bullet item turns it into a task (GitHub style)', () => {
    const d = doc(ul(b('first'), b('[x]'), b('last')));
    const start = posOf(d, '[x]');
    const state = EditorState.create({ doc: d, selection: TextSelection.create(d, start + 3) });
    const rule = taskItemRule() as any;
    const next = state.apply(rule.handler(state, '[x] '.match(rule.match), start, start + 3));
    expect(shape(next)).toBe(doc(ul(b('first')), tl(ti(true, p())), ul(b('last'))).toString());
    expect(next.doc.child(1).firstChild!.attrs['checked']).toBe(true);
    expect(next.selection.$from.parent.type.name).toBe('paragraph');
    expect(next.selection.$from.node(-1).type.name).toBe('task_item');
  });
});

// ── Moving items ──────────────────────────────────────────────────

describe('Moving list items', () => {
  it('Alt+Shift+Up and Down move the item, with its children, past its neighbor', () => {
    const d = doc(ul(b('A'), b('B', ul(b('B1'))), b('C')));
    const up = run(stateAt(d, 'B'), moveListItemCommand('up'));
    expect(shape(up)).toBe(doc(ul(b('B', ul(b('B1'))), b('A'), b('C'))).toString());
    expect(textAtCursor(up)).toBe('B');
    const down = run(stateAt(d, 'B'), moveListItemCommand('down'));
    expect(shape(down)).toBe(doc(ul(b('A'), b('C'), b('B', ul(b('B1'))))).toString());
    expect(moveListItemCommand('up')(stateAt(d, 'A'))).toBe(false);
  });

  const listPosOf = (d: PMNode, text: string) => {
    const $pos = d.resolve(posOf(d, text));
    return { item: $pos.before($pos.depth - 1), list: $pos.before($pos.depth - 2) };
  };

  it('drag and drop: reorders, nests under an item, and moves out of a list', () => {
    const d = doc(ul(b('A'), b('B'), b('C')), p('after'));
    const state = EditorState.create({ doc: d });
    const { item: c, list } = listPosOf(d, 'C');

    const first = moveListItemTo(state, c, { kind: 'item', listPos: list, index: 0 })!;
    expect(state.apply(first).doc.toString()).toBe(
      doc(ul(b('C'), b('A'), b('B')), p('after')).toString(),
    );

    const { item: a } = listPosOf(d, 'A');
    const nested = moveListItemTo(state, c, { kind: 'sublist', itemPos: a })!;
    expect(state.apply(nested).doc.toString()).toBe(
      doc(ul(b('A', ul(b('C'))), b('B')), p('after')).toString(),
    );

    const out = moveListItemTo(state, c, { kind: 'block', pos: d.content.size })!;
    expect(state.apply(out).doc.toString()).toBe(
      doc(ul(b('A'), b('B')), p('after'), ul(b('C'))).toString(),
    );
  });

  it('drag and drop: an item takes the type of the list it lands in; no-ops are refused', () => {
    const d = doc(ul(b('A'), b('B')), tl(ti(true, p('T'))));
    const state = EditorState.create({ doc: d });
    const { item: a, list: bullets } = listPosOf(d, 'A');
    const { list: tasks } = listPosOf(d, 'T');
    const tr = moveListItemTo(state, a, { kind: 'item', listPos: tasks, index: 1 })!;
    expect(state.apply(tr).doc.toString()).toBe(
      doc(ul(b('B')), tl(ti(true, p('T')), ti(false, p('A')))).toString(),
    );

    expect(moveListItemTo(state, a, { kind: 'item', listPos: bullets, index: 1 })).toBeNull();
    expect(moveListItemTo(state, a, { kind: 'sublist', itemPos: a })).toBeNull();
  });

  it('drag and drop: the last item leaves no empty list behind', () => {
    const d = doc(ul(b('A')), ol(1, b('1')));
    const state = EditorState.create({ doc: d });
    const { item: a } = listPosOf(d, 'A');
    const { list: numbers } = listPosOf(d, '1');
    const tr = moveListItemTo(state, a, { kind: 'item', listPos: numbers, index: 0 })!;
    expect(state.apply(tr).doc.toString()).toBe(doc(ol(1, b('A'), b('1'))).toString());
  });
});

// ── Toolbar state ─────────────────────────────────────────────────

describe('listStateAt', () => {
  it('describes the list at the cursor for the toolbar', () => {
    const d = doc(ol(4, b('A'), b('B', ul(b('nested')))), p('x'));
    const atB = listStateAt(stateAt(d, 'B'))!;
    expect(atB).toMatchObject({
      kind: 'ordered_list',
      level: 1,
      order: 4,
      itemNumber: 5,
      canIndent: true,
      canOutdent: true,
      canMoveUp: true,
      canMoveDown: false,
      canContinue: false,
      canRestart: true,
    });
    expect(listStateAt(stateAt(d, 'nested'))).toMatchObject({ kind: 'bullet_list', level: 2 });
    expect(listStateAt(stateAt(d, 'x'))).toBeNull();
  });
});

// ── HTML and Markdown ─────────────────────────────────────────────

describe('List HTML', () => {
  it('writes and reads start numbers, number and bullet styles; plain lists stay plain', () => {
    const numbered = N['ordered_list'].create({ order: 3, numberStyle: 'lower-roman' }, [b('A')]);
    const squares = N['bullet_list'].create({ bulletStyle: 'square' }, [b('B')]);
    const dashes = N['bullet_list'].create({ bulletStyle: 'dash' }, [b('C')]);
    const html = docToHtml(doc(numbered, squares, dashes, ul(b('plain'))), {
      highlightCode: false,
    });
    expect(html).toContain(
      '<ol start="3" data-number-style="lower-roman" type="i" style="list-style-type: lower-roman;">',
    );
    expect(html).toContain('style="list-style-type: square;"');
    expect(html).toContain('list-style-type: &quot;– &quot;');
    expect(html).toContain('<ul><li><p>plain</p></li></ul>');

    const back = htmlToDoc(html);
    expect(back.child(0).attrs).toMatchObject({ order: 3, numberStyle: 'lower-roman' });
    expect(back.child(1).attrs['bulletStyle']).toBe('square');
    expect(back.child(2).attrs['bulletStyle']).toBe('dash');
    expect(back.child(3).attrs['bulletStyle']).toBeNull();
  });

  it('reads <ol type> and keeps attributes a list type does not show through copy and paste', () => {
    const fromType = htmlToDoc('<ol type="A" start="2"><li><p>x</p></li></ol>');
    expect(fromType.firstChild!.attrs).toMatchObject({ order: 2, numberStyle: 'upper-alpha' });

    const bullets = N['bullet_list'].create({ order: 5 }, [b('kept')]);
    expect(htmlToDoc(docToHtml(doc(bullets))).firstChild!.attrs['order']).toBe(5);
  });

  it('ignores unsafe attribute values from shared documents', () => {
    const evil = N['bullet_list'].create({ bulletStyle: '"};x{', order: 'oops' }, [b('A')]);
    const html = docToHtml(doc(evil), { highlightCode: false });
    expect(html).toBe('<ul><li><p>A</p></li></ul>');
  });

  it('gives task lists a list role (they hide their bullets)', () => {
    expect(docToHtml(doc(tl(ti(false, p('t')))))).toContain('role="list"');
  });
});

describe('List Markdown', () => {
  it('writes tight lists, with nested lists indented under their item', () => {
    const md = docToMarkdown(doc(ul(b('A', ul(b('A1'))), b('B')), ol(3, b('three'), b('four'))));
    expect(md).toBe('* A\n  * A1\n* B\n\n3. three\n4. four');
  });

  it('writes a list loose when an item has two paragraphs, or when it was imported loose', () => {
    expect(docToMarkdown(doc(ul(li(p('A'), p('more')), b('B'))))).toBe('* A\n\n  more\n\n* B');
    const loose = markdownToDoc('- a\n\n- b\n');
    expect(loose.firstChild!.attrs['tight']).toBe(false);
    expect(docToMarkdown(loose)).toBe('* a\n\n* b');
  });

  it('round-trips: import, export and import again give the same document', () => {
    const samples = [
      '* a\n* b\n  * c\n    * d\n* e',
      '3. three\n4. four\n   1. nested\n5. five',
      '- [ ] todo\n- [x] done\n  - [ ] sub',
      '* a\n\n* b',
      '* first\n\n  second paragraph\n\n* next',
      '* ## Heading item\n* plain',
      '1. a\n\n   b\n2. c',
    ];
    for (const md of samples) {
      const once = markdownToDoc(md);
      const twice = markdownToDoc(docToMarkdown(once));
      expect(twice.eq(once), md).toBe(true);
    }
  });

  it('a task list written tight stays tight', () => {
    expect(docToMarkdown(markdownToDoc('- [ ] a\n- [x] b'))).toBe('- [ ] a\n- [x] b');
  });
});

describe('Pasting numbered lists from Word', () => {
  const wordItem = (marker: string, text: string, list = 'l0', level = 1) =>
    `<p class=MsoListParagraph style='mso-list:${list} level${level} lfo1'><span style='mso-list:Ignore'>${marker}<span>&nbsp;</span></span>${text}</p>`;
  const wordHtml = (body: string) =>
    `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name=Generator content="Microsoft Word 15"></head><body>${body}</body></html>`;

  it('keeps the start number and a letter or Roman style', () => {
    const html = cleanPastedHtml(
      wordHtml(wordItem('3.', 'three') + wordItem('4.', 'four') + wordItem('C.', 'see', 'l1')),
    );
    const d = htmlToDoc(html);
    expect(d.child(0).attrs).toMatchObject({ order: 3, numberStyle: null });
    expect(d.child(0).childCount).toBe(2);
    expect(d.child(1).attrs).toMatchObject({ order: 3, numberStyle: 'upper-alpha' });

    const roman = htmlToDoc(cleanPastedHtml(wordHtml(wordItem('iv.', 'four', 'l2'))));
    expect(roman.firstChild!.attrs).toMatchObject({ order: 4, numberStyle: 'lower-roman' });
  });
});

describe('Task lists and switching list types', () => {
  it('transforms [ ] input rule into task_list with unchecked task_item', () => {
    const doc = schema.node('doc', null, [
      schema.nodes['paragraph'].create(null, [schema.text('[ ] Buy milk')]),
    ]);
    const state = EditorState.create({ schema, doc });
    const rule = taskItemRule();
    // Match "[ ] " at start of paragraph: start = 1, end = 5
    const match = '[ ] '.match(/^\s*\[([ xX]?)\]\s$/)!;
    const tr = (rule as any).handler(state, match, 1, 5);

    expect(tr).toBeTruthy();
    const updatedDoc = tr.doc;
    const list = updatedDoc.firstChild;
    expect(list?.type.name).toBe('task_list');
    const item = list?.firstChild;
    expect(item?.type.name).toBe('task_item');
    expect(item?.attrs['checked']).toBe(false);
    expect(item?.textContent).toBe('Buy milk');
  });

  it('transforms [x] input rule into task_list with checked task_item', () => {
    const doc = schema.node('doc', null, [
      schema.nodes['paragraph'].create(null, [schema.text('[x] Finished chore')]),
    ]);
    const state = EditorState.create({ schema, doc });
    const rule = taskItemRule();
    const match = '[x] '.match(/^\s*\[([ xX]?)\]\s$/)!;
    const tr = (rule as any).handler(state, match, 1, 5);

    expect(tr).toBeTruthy();
    const updatedDoc = tr.doc;
    const list = updatedDoc.firstChild;
    expect(list?.type.name).toBe('task_list');
    const item = list?.firstChild;
    expect(item?.type.name).toBe('task_item');
    expect(item?.attrs['checked']).toBe(true);
    expect(item?.textContent).toBe('Finished chore');
  });

  it('splitListItem creates a new unchecked task item when splitting a checked item', () => {
    const checkedItem = schema.nodes['task_item'].create({ checked: true }, [
      schema.nodes['paragraph'].create(null, [schema.text('Done with task')]),
    ]);
    const taskList = schema.nodes['task_list'].create(null, [checkedItem]);
    const doc = schema.node('doc', null, [taskList]);

    // Selection at the end of "Done with task" (pos 17)
    let state = EditorState.create({ schema, doc });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 17)));

    let nextState: EditorState | null = null;
    const cmd = splitListItem(schema.nodes['task_item'], { checked: false });
    const handled = cmd(state, (tr) => {
      nextState = state.apply(tr);
    });

    expect(handled).toBe(true);
    expect(nextState).toBeTruthy();
    const list = nextState!.doc.firstChild;
    expect(list?.type.name).toBe('task_list');
    expect(list?.childCount).toBe(2);
    expect(list?.child(0).attrs['checked']).toBe(true);
    expect(list?.child(1).attrs['checked']).toBe(false);
  });

  it('split or lift command lifts empty task item out of task_list on Enter', () => {
    const emptyItem = schema.nodes['task_item'].create({ checked: false }, [
      schema.nodes['paragraph'].create(null),
    ]);
    const taskList = schema.nodes['task_list'].create(null, [emptyItem]);
    const doc = schema.node('doc', null, [taskList]);

    let state = EditorState.create({ schema, doc });
    // Selection in the empty item (pos 3)
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));

    let nextState: EditorState | null = null;
    const cmd = (s: EditorState, d?: (tr: any) => void) =>
      splitListItem(schema.nodes['task_item'], { checked: false })(s, d) ||
      liftListItem(schema.nodes['task_item'])(s, d);
    const handled = cmd(state, (tr) => {
      nextState = state.apply(tr);
    });

    expect(handled).toBe(true);
    expect(nextState).toBeTruthy();
    // Should lift out and turn into a regular paragraph
    expect(nextState!.doc.firstChild?.type.name).toBe('paragraph');
  });

  it('TaskItemNodeView renders checkbox, contentDOM, and updates state reactively', () => {
    const itemNode = schema.nodes['task_item'].create({ checked: false }, [
      schema.nodes['paragraph'].create(null, [schema.text('Task item')]),
    ]);

    const dummyView = {
      state: EditorState.create({ schema }),
      dispatch: () => {},
    } as unknown as EditorView;

    const nodeView = new TaskItemNodeView(itemNode, dummyView, () => 1);
    expect(nodeView.dom.tagName.toLowerCase()).toBe('li');
    expect(nodeView.dom.className).toBe('ink-task-item');
    expect(nodeView.contentDOM).toBeTruthy();

    const checkbox = nodeView.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    // Verify stopEvent prevents ProseMirror from intercepting checkbox interactions
    const clickEvent = new MouseEvent('click');
    Object.defineProperty(clickEvent, 'target', { value: checkbox });
    expect(nodeView.stopEvent(clickEvent)).toBe(true);

    // Verify node update changes checked attribute and class
    const updatedNode = schema.nodes['task_item'].create({ checked: true }, [
      schema.nodes['paragraph'].create(null, [schema.text('Task item')]),
    ]);
    const updated = nodeView.update(updatedNode);
    expect(updated).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(nodeView.dom.classList.contains('checked')).toBe(true);
  });

  it('toggleListCommand auto-switches seamlessly between bullet, ordered, and task lists without manual unselecting', () => {
    // 1. Start with a bullet list
    const li = schema.nodes['list_item'].create(null, [
      schema.nodes['paragraph'].create(null, [schema.text('First item')]),
    ]);
    const bulletList = schema.nodes['bullet_list'].create(null, [li]);
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [bulletList]),
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));

    // 2. Auto-switch to ordered_list without unselecting
    let nextState: EditorState = state;
    toggleListCommand('ordered_list')(state, (tr) => {
      nextState = state.apply(tr);
    });
    expect(nextState.doc.firstChild?.type.name).toBe('ordered_list');
    expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('list_item');
    expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

    // 3. Auto-switch from ordered_list to task_list without unselecting
    state = nextState;
    toggleListCommand('task_list')(state, (tr) => {
      nextState = state.apply(tr);
    });
    expect(nextState.doc.firstChild?.type.name).toBe('task_list');
    expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('task_item');
    expect(nextState.doc.firstChild?.firstChild?.attrs['checked']).toBe(false);
    expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

    // 4. Auto-switch from task_list back to bullet_list without unselecting
    state = nextState;
    toggleListCommand('bullet_list')(state, (tr) => {
      nextState = state.apply(tr);
    });
    expect(nextState.doc.firstChild?.type.name).toBe('bullet_list');
    expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('list_item');
    expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

    // 5. Selecting the same active list lifts out to paragraph (toggles off)
    state = nextState;
    toggleListCommand('bullet_list')(state, (tr) => {
      nextState = state.apply(tr);
    });
    expect(nextState.doc.firstChild?.type.name).toBe('paragraph');
    expect(nextState.doc.firstChild?.textContent).toBe('First item');
  });

  it('supports arbitrary nesting combinations across bullet, ordered, and task lists', () => {
    // 1. Bullet list with nested Ordered list and nested Task list
    const taskItem1 = schema.nodes['task_item'].create({ checked: false }, [
      schema.nodes['paragraph'].create(null, [schema.text('Subtask A')]),
    ]);
    const taskItem2 = schema.nodes['task_item'].create({ checked: true }, [
      schema.nodes['paragraph'].create(null, [schema.text('Subtask B')]),
    ]);
    const nestedTaskList = schema.nodes['task_list'].create(null, [taskItem1, taskItem2]);

    const orderedItem = schema.nodes['list_item'].create(null, [
      schema.nodes['paragraph'].create(null, [schema.text('Ordered step 1')]),
      nestedTaskList,
    ]);
    const nestedOrderedList = schema.nodes['ordered_list'].create(null, [orderedItem]);

    const rootBulletItem = schema.nodes['list_item'].create(null, [
      schema.nodes['paragraph'].create(null, [schema.text('Main bullet')]),
      nestedOrderedList,
    ]);
    const rootDoc = schema.node('doc', null, [
      schema.nodes['bullet_list'].create(null, [rootBulletItem]),
    ]);

    expect(rootDoc.check()).toBeUndefined(); // valid schema structure

    // HTML serialization & round-trip of mixed nested hierarchy
    const html = docToHtml(rootDoc);
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('ink-task-list');

    const parsedDoc = htmlToDoc(html);
    expect(parsedDoc.firstChild?.type.name).toBe('bullet_list');
    const innerOrdered = parsedDoc.firstChild?.firstChild?.lastChild;
    expect(innerOrdered?.type.name).toBe('ordered_list');
    const innerTask = innerOrdered?.firstChild?.lastChild;
    expect(innerTask?.type.name).toBe('task_list');
    expect(innerTask?.child(0).attrs['checked']).toBe(false);
    expect(innerTask?.child(1).attrs['checked']).toBe(true);

    // Markdown export
    const md = docToMarkdown(rootDoc);
    expect(md).toContain('Main bullet');
    expect(md).toContain('Ordered step 1');
    expect(md).toContain('[ ] Subtask A');
    expect(md).toContain('[x] Subtask B');
  });
});
