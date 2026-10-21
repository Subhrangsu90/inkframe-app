import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema/schema';
import { DEFAULT_HIGHLIGHT_COLOR } from './highlight-schema';
import {
  removeHighlightCommand,
  setHighlightCommand,
  toggleHighlightCommand,
} from './highlight-commands';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';

const { nodes, marks } = schema;
const text = (t: string, m: ReturnType<typeof marks.highlight.create>[] = []) => schema.text(t, m);
const p = (content: string | PMNode[] = [], align: string | null = null) =>
  nodes['paragraph'].create(
    { align },
    typeof content === 'string' ? (content ? [text(content)] : []) : content,
  );
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

  it('wraps a text color, so the color shows on the highlight', () => {
    const both = [
      marks['highlight'].create({ color: '#bfdbfe' }),
      marks['textColor'].create({ color: '#ea580c' }),
    ];
    const d = doc(p([text('Welcome', both), text(' plain')]));
    // The marks on "Welcome"; HTML may write the text color as rgb().
    const marksOf = (parsed: PMNode) =>
      parsed.firstChild!.firstChild!.marks.map((m) => [m.type.name, m.attrs['color']]);
    const expected = [
      ['highlight', '#bfdbfe'],
      ['textColor', expect.stringMatching(/^(#ea580c|rgb\(234, 88, 12\))$/)],
    ];

    // <mark> draws its text dark; the color's <span> inside it keeps its own color.
    const html = docToHtml(d);
    expect(html).toMatch(
      /^<p><mark [^>]*><span style="color: [^"]+">Welcome<\/span><\/mark> plain<\/p>$/,
    );
    expect(marksOf(htmlToDoc(html))).toEqual(expected);

    const md = docToMarkdown(d);
    expect(md).toBe(
      '<mark style="background-color: #bfdbfe"><span style="color: #ea580c">Welcome</span></mark> plain',
    );
    expect(markdownToDoc(md).eq(d)).toBe(true);

    // Documents written with the color outside the highlight read the same.
    expect(
      marksOf(
        htmlToDoc(
          '<p><span style="color: #ea580c"><mark data-color="#bfdbfe" style="background-color: #bfdbfe">Welcome</mark></span> plain</p>',
        ),
      ),
    ).toEqual(expected);
    expect(
      markdownToDoc(
        '<span style="color: #ea580c"><mark style="background-color: #bfdbfe">Welcome</mark></span> plain',
      ).eq(d),
    ).toBe(true);
  });
});
