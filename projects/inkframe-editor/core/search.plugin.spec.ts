import { describe, it, expect } from 'vitest';
import { Command, EditorState, TextSelection } from 'prosemirror-state';
import { history, undo } from 'prosemirror-history';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from './schema';
import {
  findMatches,
  findNextCommand,
  findPreviousCommand,
  getSearchState,
  replaceAllCommand,
  replaceCurrentCommand,
  searchKey,
  searchPlugin,
  setSearchQueryCommand,
} from './search.plugin';

const { nodes, marks } = schema;
const p = (...content: (string | PMNode)[]) =>
  nodes['paragraph'].create(null, content.map((c) => (typeof c === 'string' ? schema.text(c) : c)));
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);

/** A document with the query in a heading, a paragraph, a list, a code block and a table cell. */
function richDoc(): PMNode {
  const cell = (text: string) => nodes['table_cell'].create(null, [p(text)]);
  return doc(
    nodes['heading'].create({ level: 1 }, [schema.text('Apple pie')]),
    p('An apple a day, ', schema.text('APPLE', [marks['strong'].create()]), ' juice.'),
    nodes['bullet_list'].create(null, [nodes['list_item'].create(null, [p('apple tree')])]),
    nodes['code_block'].create({ language: 'js' }, [schema.text('const apple = 1;')]),
    nodes['table'].create(null, [nodes['table_row'].create(null, [cell('pineapple'), cell('pear')])]),
  );
}

function stateFor(d: PMNode): EditorState {
  return EditorState.create({ schema, doc: d, plugins: [history(), searchPlugin()] });
}

function apply(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

const textOf = (state: EditorState) =>
  getSearchState(state)!.matches.map((m) => state.doc.textBetween(m.from, m.to));

describe('findMatches', () => {
  it('finds matches in headings, paragraphs, lists, code blocks and table cells', () => {
    const d = richDoc();
    const found = findMatches(d, 'apple').map((m) => d.textBetween(m.from, m.to));
    expect(found).toEqual(['Apple', 'apple', 'APPLE', 'apple', 'apple', 'apple']);
  });

  it('can match case', () => {
    const d = richDoc();
    expect(findMatches(d, 'APPLE', { caseSensitive: true })).toHaveLength(1);
    expect(findMatches(d, 'Apple', { caseSensitive: true })).toHaveLength(1);
  });

  it('treats the query as text, not as a regular expression', () => {
    const d = doc(p('Costs $5 (approx.) or $5.00; a.b'));
    expect(findMatches(d, '$5 (approx.)')).toHaveLength(1);
    expect(findMatches(d, 'a.b')).toHaveLength(1);
    expect(findMatches(d, '.')).toHaveLength(3);
  });

  it('does not match across blocks or across an image', () => {
    const img = nodes['image'].create({ src: 'https://example.com/x.png' });
    const d = doc(p('ab'), p('cd'), p('ef', img, 'gh'));
    expect(findMatches(d, 'bc')).toHaveLength(0);
    expect(findMatches(d, 'fg')).toHaveLength(0);
    const [m] = findMatches(d, 'gh');
    expect(d.textBetween(m.from, m.to)).toBe('gh');
  });
});

describe('searchPlugin', () => {
  it('highlights every match, marks the current one and selects it', () => {
    let state = stateFor(richDoc());
    state = apply(state, setSearchQueryCommand('apple'));
    const search = getSearchState(state)!;
    expect(search.matches).toHaveLength(6);
    expect(search.current).toBe(0);

    const decorations = search.decorations.find();
    expect(decorations).toHaveLength(6);
    expect(decorations.filter((d) => (d as any).type.attrs.class.includes('current'))).toHaveLength(1);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('Apple');
  });

  it('starts at the first match after the cursor and wraps around', () => {
    let state = stateFor(richDoc());
    const listPos = findMatches(state.doc, 'tree')[0].from;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, listPos)));
    state = apply(state, setSearchQueryCommand('apple'));
    expect(getSearchState(state)!.current).toBe(4); // the code block

    state = apply(state, findNextCommand);
    expect(getSearchState(state)!.current).toBe(5); // pineapple in the table
    state = apply(state, findNextCommand);
    expect(getSearchState(state)!.current).toBe(0);
    state = apply(state, findPreviousCommand);
    expect(getSearchState(state)!.current).toBe(5);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe('apple');
  });

  it('searches again when the document changes', () => {
    let state = stateFor(doc(p('one fish two fish')));
    state = apply(state, setSearchQueryCommand('fish'));
    expect(getSearchState(state)!.matches).toHaveLength(2);
    state = state.apply(state.tr.insertText(' red fish', state.doc.content.size - 1));
    expect(getSearchState(state)!.matches).toHaveLength(3);
  });

  it('an empty query clears the matches and decorations', () => {
    let state = stateFor(richDoc());
    state = apply(state, setSearchQueryCommand('apple'));
    state = apply(state, setSearchQueryCommand(''));
    expect(getSearchState(state)!.matches).toHaveLength(0);
    expect(getSearchState(state)!.decorations.find()).toHaveLength(0);
    expect(findNextCommand(state)).toBe(false);
    expect(replaceAllCommand('x')(state)).toBe(false);
  });

  it('is inactive without the plugin', () => {
    const state = EditorState.create({ schema, doc: richDoc() });
    expect(searchKey.getState(state)).toBeUndefined();
    expect(setSearchQueryCommand('apple')(state)).toBe(false);
  });
});

describe('replace', () => {
  it('replaces the current match, keeps its formatting and moves to the next match', () => {
    let state = stateFor(richDoc());
    state = apply(state, setSearchQueryCommand('apple'));
    state = apply(state, findNextCommand);
    state = apply(state, findNextCommand); // the bold APPLE
    state = apply(state, replaceCurrentCommand('PEAR'));

    expect(state.doc.child(1).textContent).toBe('An apple a day, PEAR juice.');
    const pear = state.doc.nodeAt(findMatches(state.doc, 'PEAR', { caseSensitive: true })[0].from)!;
    expect(pear.marks.map((m) => m.type.name)).toEqual(['strong']);

    const search = getSearchState(state)!;
    expect(textOf(state)).toEqual(['Apple', 'apple', 'apple', 'apple', 'apple']);
    expect(search.current).toBe(2); // the list item: the match after the replaced one
    const listMatch = findMatches(state.doc, 'apple tree')[0];
    expect(state.selection.from).toBe(listMatch.from);
  });

  it('replaces in code blocks and table cells', () => {
    let state = stateFor(richDoc());
    state = apply(state, setSearchQueryCommand('apple', { caseSensitive: true }));
    state = apply(state, replaceAllCommand('kiwi'));
    expect(state.doc.child(3).textContent).toBe('const kiwi = 1;');
    expect(state.doc.child(4).textContent).toBe('pinekiwipear');
    expect(state.doc.child(0).textContent).toBe('Apple pie'); // case-sensitive: untouched
  });

  it('replace all is a single undo step', () => {
    let state = stateFor(richDoc());
    const before = state.doc;
    state = apply(state, setSearchQueryCommand('apple'));
    state = apply(state, replaceAllCommand('fig'));
    expect(findMatches(state.doc, 'apple')).toHaveLength(0);
    expect(findMatches(state.doc, 'fig')).toHaveLength(6);
    expect(getSearchState(state)!.matches).toHaveLength(0);

    state = apply(state, undo);
    expect(state.doc.eq(before)).toBe(true);
  });

  it('replacing a whole paragraph with nothing empties it but keeps the block', () => {
    let state = stateFor(doc(p('remove me'), p('keep')));
    state = apply(state, setSearchQueryCommand('remove me'));
    state = apply(state, replaceCurrentCommand(''));
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(0).type.name).toBe('paragraph');
    expect(state.doc.child(0).content.size).toBe(0);
  });

  it('keeps a link when its whole text is replaced', () => {
    const link = marks['link'].create({ href: 'https://example.com' });
    let state = stateFor(doc(p('see ', schema.text('docs', [link]), ' now')));
    state = apply(state, setSearchQueryCommand('docs'));
    state = apply(state, replaceCurrentCommand('guide'));
    const node = state.doc.nodeAt(5)!;
    expect(node.text).toBe('guide');
    expect(node.marks[0].type.name).toBe('link');
  });
});
