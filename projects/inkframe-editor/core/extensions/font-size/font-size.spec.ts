import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema/schema';
import { fontSizeAt, removeFontSizeCommand, setFontSizeCommand } from './font-size-commands';
import { sanitizeFontSize } from './font-size-schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { cleanPastedHtml } from '../paste-cleanup/paste-cleanup';

const { nodes, marks } = schema;
const size = (px: number) => marks['fontSize'].create({ size: px });
const text = (t: string, m: Mark[] = []) => schema.text(t, m);
const p = (...content: PMNode[]) => nodes['paragraph'].create(null, content);
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

const sizesIn = (node: PMNode) => {
  const out: (number | null)[] = [];
  node.descendants((n) => {
    if (n.isText) out.push(marks['fontSize'].isInSet(n.marks)?.attrs['size'] ?? null);
  });
  return out;
};

describe('Font size', () => {
  it('sizes the selected text, and resets it', () => {
    let state = stateWith(doc(p(text('Hello world'))), 1, 6);
    state = run(state, setFontSizeCommand(24));
    expect(sizesIn(state.doc)).toEqual([24, null]);
    expect(fontSizeAt(state)).toBe(24);

    state = run(state, setFontSizeCommand(18));
    expect(sizesIn(state.doc)).toEqual([18, null]);

    state = run(state, removeFontSizeCommand);
    expect(sizesIn(state.doc)).toEqual([null]);
    expect(fontSizeAt(state)).toBeNull();
  });

  it('applies to the text typed next when nothing is selected', () => {
    let state = stateWith(doc(p(text('ab'))), 2);
    state = run(state, setFontSizeCommand(30));
    expect(fontSizeAt(state)).toBe(30);
    state = state.apply(state.tr.insertText('X'));
    expect(sizesIn(state.doc)).toEqual([null, 30, null]);
  });

  it('reports a size only when all of the selection has it', () => {
    const d = doc(p(text('big', [size(36)]), text(' small', [size(12)]), text(' plain')));
    expect(fontSizeAt(stateWith(d, 1, 4))).toBe(36);
    expect(fontSizeAt(stateWith(d, 1, 8))).toBeNull();
    expect(fontSizeAt(stateWith(d, 11, 14))).toBeNull();
  });

  it('cannot size inline code', () => {
    let state = stateWith(doc(p(text('code', [marks['code'].create()]))), 1, 5);
    state = run(state, setFontSizeCommand(24));
    expect(sizesIn(state.doc)).toEqual([null]);
  });

  it('checks sizes', () => {
    expect([14, '18', 6, 120, 5, 121, 13.6, 'x', null].map(sanitizeFontSize)).toEqual([
      14,
      18,
      6,
      120,
      null,
      null,
      14,
      null,
      null,
    ]);
  });
});

describe('Font size in HTML and Markdown', () => {
  it('writes a span with the size, and reads it back', () => {
    const d = doc(p(text('Big', [size(48)]), text(' text')));
    const html = docToHtml(d);
    expect(html).toBe('<p><span data-font-size="48" style="font-size: 48px;">Big</span> text</p>');
    expect(htmlToDoc(html).eq(d)).toBe(true);
  });

  it('reads no sizes from other pages, Word or Google Docs: they are the source styling', () => {
    expect(sizesIn(htmlToDoc('<p><span style="font-size: 30px">web</span></p>'))).toEqual([null]);
    const docs = cleanPastedHtml(
      '<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;font-family:Arial">Docs</span></p></b>',
    );
    expect(sizesIn(htmlToDoc(docs))).toEqual([null]);
  });

  it('never writes unsafe values', () => {
    const d = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'x', marks: [{ type: 'fontSize', attrs: { size: '1px; x' } }] },
          ],
        },
      ],
    });
    expect(docToHtml(d)).toBe('<p><span>x</span></p>');
    expect(docToMarkdown(d)).toBe('x');
  });

  it('round-trips through Markdown as <span style="font-size">, nested with colors', () => {
    const red = marks['textColor'].create({ color: '#dc2626' });
    const d = doc(
      p(
        text('Large ', [size(24)]),
        text('and red', [size(24), red]),
        text(', red only', [red]),
        text(' plain'),
      ),
    );
    const md = docToMarkdown(d);
    expect(md).toContain('<span style="font-size: 24px">');
    expect(markdownToDoc(md).eq(d)).toBe(true);
  });

  it('leaves spans it did not write as text', () => {
    const d = markdownToDoc('<span style="font-size: 2em">x</span>');
    expect(d.textContent).toBe('<span style="font-size: 2em">x</span>');
  });
});
