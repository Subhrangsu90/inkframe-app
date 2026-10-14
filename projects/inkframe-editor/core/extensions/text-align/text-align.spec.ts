import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { CellSelection } from 'prosemirror-tables';
import { schema } from '../../schema/schema';
import {
  setBlockTypeKeepingAlign,
  setTextAlignCommand,
  splitAlignedBlockCommand,
  textAlignAt,
} from './text-align-commands';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';

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
