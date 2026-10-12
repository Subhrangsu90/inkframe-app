import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { CellSelection } from 'prosemirror-tables';
import { DEFAULT_HIGHLIGHT_COLOR, schema } from './schema';
import {
  removeHighlightCommand,
  setBlockTypeKeepingAlign,
  setHighlightCommand,
  setTextAlignCommand,
  splitAlignedBlockCommand,
  textAlignAt,
  toggleHighlightCommand,
} from './plugins';
import { docToHtml, htmlToDoc } from './io/html';
import { docToMarkdown, markdownToDoc } from './io/markdown';
import { SCHEMA_VERSION, StoredDoc, migrate } from './migrations';

const { nodes, marks } = schema;
const text = (t: string, m: ReturnType<typeof marks.highlight.create>[] = []) => schema.text(t, m);
const p = (content: string | PMNode[] = [], align: string | null = null) =>
  nodes['paragraph'].create(
    { align },
    typeof content === 'string' ? (content ? [text(content)] : []) : content,
  );
const h = (level: number, content: string, align: string | null = null) =>
  nodes['heading'].create({ level, align }, [text(content)]);
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);

function stateWith(d: PMNode, from = 1, to = from): EditorState {
  const state = EditorState.create({ schema, doc: d });
  return state.apply(state.tr.setSelection(TextSelection.create(d, from, to)));
}

function run(state: EditorState, command: (s: EditorState, d?: any) => boolean): EditorState {
  let next = state;
  command(state, (tr: any) => (next = state.apply(tr)));
  return next;
}

describe('Highlight mark', () => {
  it('serializes to <mark> with the color and parses back losslessly', () => {
    const d = doc(
      p([text('plain '), text('marked', [marks['highlight'].create({ color: '#bbf7d0' })])]),
    );
    const html = docToHtml(d);
    // DOM implementations may serialize the style as rgb() and add a semicolon.
    expect(html).toMatch(
      /<mark data-color="#bbf7d0" style="background-color: (#bbf7d0|rgb\(187, 247, 208\));?">marked<\/mark>/,
    );
    expect(htmlToDoc(html).eq(d)).toBe(true);
  });

  it('parses a plain <mark> with the default color and a background span as a highlight', () => {
    const plain = htmlToDoc(
      '<p><mark>a</mark> <span style="background-color: #fecaca">b</span></p>',
    );
    const markAt = (pos: number) =>
      plain.nodeAt(pos)!.marks.find((m) => m.type.name === 'highlight');
    expect(markAt(1)?.attrs['color']).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(markAt(3)?.attrs['color']).toMatch(/#fecaca|rgb\(254, 202, 202\)/);
  });

  it('ignores transparent backgrounds and keeps table cell backgrounds on the cell', () => {
    const d = htmlToDoc(
      '<p><span style="background-color: transparent">a</span><span style="background-color: rgba(0, 0, 0, 0)">b</span></p>' +
        '<table><tr><td style="background-color: #fef08a"><p>cell</p></td></tr></table>',
    );
    let highlights = 0;
    d.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'highlight')) highlights++;
    });
    expect(highlights).toBe(0);
    const cell = d.child(1).child(0).child(0);
    expect(cell.attrs['background']).toMatch(/#fef08a|rgb\(254, 240, 138\)/);
  });

  it('never writes unsafe colors into the style attribute', () => {
    const d = doc(
      p([
        text('x', [marks['highlight'].create({ color: 'red; background:url(https://t.example)' })]),
      ]),
    );
    const html = docToHtml(d);
    expect(html).not.toContain('url(');
    expect(html).toContain(`data-color="${DEFAULT_HIGHLIGHT_COLOR}"`);
    expect(html).toMatch(/background-color: (#fef08a|rgb\(254, 240, 138\))/);
  });

  it('commands set, replace, toggle and remove the highlight', () => {
    let state = stateWith(doc(p('hello world')), 1, 6);
    state = run(state, setHighlightCommand('#bfdbfe'));
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe('#bfdbfe');

    state = run(state, setHighlightCommand('#fecaca'));
    expect(state.doc.nodeAt(1)!.marks).toHaveLength(1);
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe('#fecaca');

    state = run(state, toggleHighlightCommand);
    expect(state.doc.rangeHasMark(1, 6, marks['highlight'])).toBe(false);

    state = run(state, toggleHighlightCommand);
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe(DEFAULT_HIGHLIGHT_COLOR);

    state = run(state, removeHighlightCommand);
    expect(state.doc.rangeHasMark(1, 6, marks['highlight'])).toBe(false);
  });

  it('round-trips through Markdown as <mark> and reads ==text==', () => {
    const d = doc(
      p([
        text('a '),
        text('marked', [marks['highlight'].create({ color: '#e9d5ff' })]),
        text(' b'),
      ]),
    );
    const md = docToMarkdown(d);
    expect(md).toBe('a <mark style="background-color: #e9d5ff">marked</mark> b');
    expect(markdownToDoc(md).eq(d)).toBe(true);

    const fromObsidian = markdownToDoc('Some ==important **bold** words== here, a == b, x==y');
    const highlighted: string[] = [];
    fromObsidian.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'highlight')) highlighted.push(n.text!);
    });
    expect(highlighted.join('')).toBe('important bold words');
    expect(fromObsidian.textContent).toContain('a == b');
  });
});

describe('Text alignment', () => {
  it('serializes to text-align and parses style and align attributes', () => {
    const d = doc(h(1, 'Title', 'center'), p('Body', 'justify'), p('Default'));
    const html = docToHtml(d);
    expect(html).toMatch(/<h1 style="text-align: center;?">Title<\/h1>/);
    expect(html).toMatch(/<p style="text-align: justify;?">Body<\/p>/);
    expect(html).toContain('<p>Default</p>');
    expect(htmlToDoc(html).eq(d)).toBe(true);

    const legacy = htmlToDoc(
      '<p align="right">r</p><p style="text-align: left">l</p><p style="text-align:-webkit-center">c</p>',
    );
    expect(legacy.child(0).attrs['align']).toBe('right');
    expect(legacy.child(1).attrs['align']).toBeNull(); // left is the default
    expect(legacy.child(2).attrs['align']).toBe('center');
  });

  it('never writes unknown alignment values into the style attribute', () => {
    const d = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'center; background:url(x)' },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    });
    expect(docToHtml(d)).toBe('<p>x</p>');
  });

  it('aligns every paragraph and heading in the selection, and resets with left', () => {
    let state = stateWith(doc(h(2, 'One'), p('Two'), p('Three')), 2, 8);
    state = run(state, setTextAlignCommand('center'));
    expect([0, 1, 2].map((i) => state.doc.child(i).attrs['align'])).toEqual([
      'center',
      'center',
      null,
    ]);
    expect(textAlignAt(state)).toBe('center');

    state = run(state, setTextAlignCommand('left'));
    expect([0, 1].map((i) => state.doc.child(i).attrs['align'])).toEqual([null, null]);
    expect(textAlignAt(state)).toBe('left');
  });

  it('does not apply to code blocks, and aligns each cell of a cell selection', () => {
    const code = nodes['code_block'].create(null, [text('let x = 1;')]);
    const codeState = stateWith(doc(code), 2);
    expect(setTextAlignCommand('center')(codeState)).toBe(false);
    expect(textAlignAt(codeState)).toBeNull();

    const cell = (t: string) => nodes['table_cell'].create(null, [p(t)]);
    const table = nodes['table'].create(null, [
      nodes['table_row'].create(null, [cell('a'), cell('b')]),
    ]);
    let state = EditorState.create({ schema, doc: doc(table) });
    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, 2, 7)));
    state = run(state, setTextAlignCommand('right'));
    const row = state.doc.child(0).child(0);
    expect([row.child(0).child(0).attrs['align'], row.child(1).child(0).attrs['align']]).toEqual([
      'right',
      'right',
    ]);
  });

  it('keeps the alignment when a paragraph becomes a heading and back', () => {
    let state = stateWith(doc(p('Centered', 'center')), 3);
    state = run(state, setBlockTypeKeepingAlign(nodes['heading'], { level: 2 }));
    expect(state.doc.child(0).type.name).toBe('heading');
    expect(state.doc.child(0).attrs['align']).toBe('center');

    state = run(state, setBlockTypeKeepingAlign(nodes['paragraph']));
    expect(state.doc.child(0).type.name).toBe('paragraph');
    expect(state.doc.child(0).attrs['align']).toBe('center');
  });

  it('Enter at the end of an aligned block continues the alignment', () => {
    let state = stateWith(doc(h(1, 'Title', 'center')), 6);
    expect(splitAlignedBlockCommand(state)).toBe(true);
    state = run(state, splitAlignedBlockCommand);
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(1).type.name).toBe('paragraph');
    expect(state.doc.child(1).attrs['align']).toBe('center');

    // Not applicable mid-text or in unaligned blocks: the default Enter runs.
    expect(splitAlignedBlockCommand(stateWith(doc(p('Title', 'center')), 3))).toBe(false);
    expect(splitAlignedBlockCommand(stateWith(doc(p('Title')), 6))).toBe(false);
  });

  it('round-trips through Markdown with <div align> wrappers, also inside quotes, lists and callouts', () => {
    const quote = nodes['blockquote'].create(null, [p('Quoted', 'right')]);
    const list = nodes['bullet_list'].create(null, [
      nodes['list_item'].create(null, [p('Item', 'center')]),
    ]);
    const callout = nodes['callout'].create({ type: 'warning' }, [
      p('Careful', 'justify'),
      p('Plain'),
    ]);
    const d = doc(
      h(1, 'Title', 'center'),
      p([text('With '), text('bold', [marks['strong'].create()])], 'right'),
      quote,
      list,
      callout,
      p('End'),
    );

    const md = docToMarkdown(d);
    expect(md).toContain('<div align="center">\n\n# Title\n\n</div>');
    expect(md).toContain('<div align="right">\n\nWith **bold**\n\n</div>');
    expect(markdownToDoc(md).eq(d)).toBe(true);
  });

  it('leaves Markdown text that only looks like a wrapper alone', () => {
    const d = markdownToDoc('<div align="center">\n\nNo closing tag');
    expect(d.child(0).textContent).toBe('<div align="center">');
    expect(d.child(1).attrs['align']).toBeNull();
  });
});

describe('Schema version 2', () => {
  it('migrates version 1 documents unchanged and loads them in the new schema', () => {
    const v1: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Old' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body', marks: [{ type: 'strong' }] }],
          },
        ],
      },
    };
    expect(SCHEMA_VERSION).toBe(2);
    const migrated = migrate(v1);
    expect(migrated).toEqual(v1.doc);
    const node = schema.nodeFromJSON(migrated);
    node.check();
    expect(node.child(0).attrs).toEqual({ level: 1, align: null });
    expect(node.child(1).attrs).toEqual({ align: null });
  });
});
