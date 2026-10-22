import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Mark, Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema/schema';
import {
  fontFamilyAt,
  removeFontFamilyCommand,
  setFontFamilyCommand,
} from './font-family-commands';
import {
  FONT_FAMILIES,
  FontFamily,
  fontFamilyForStack,
  sanitizeFontFamily,
} from './font-family-schema';
import { DOCUMENT_FONTS } from '../page-setup/page-setup';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { cleanPastedHtml } from '../paste-cleanup/paste-cleanup';

const { nodes, marks } = schema;
const font = (value: FontFamily) => marks['fontFamily'].create({ font: value });
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

const fontsIn = (node: PMNode) => {
  const out: (string | null)[] = [];
  node.descendants((n) => {
    if (n.isText) out.push(marks['fontFamily'].isInSet(n.marks)?.attrs['font'] ?? null);
  });
  return out;
};

describe('Font family', () => {
  it('sets the font of the selected text, and resets it', () => {
    let state = stateWith(doc(p(text('Hello world'))), 1, 6);
    state = run(state, setFontFamilyCommand('georgia'));
    expect(fontsIn(state.doc)).toEqual(['georgia', null]);
    expect(fontFamilyAt(state)).toBe('georgia');

    state = run(state, setFontFamilyCommand('mono'));
    expect(fontsIn(state.doc)).toEqual(['mono', null]);

    state = run(state, removeFontFamilyCommand);
    expect(fontsIn(state.doc)).toEqual([null]);
    expect(fontFamilyAt(state)).toBeNull();
  });

  it('applies to the text typed next when nothing is selected', () => {
    let state = stateWith(doc(p(text('ab'))), 2);
    state = run(state, setFontFamilyCommand('verdana'));
    expect(fontFamilyAt(state)).toBe('verdana');
    state = state.apply(state.tr.insertText('X'));
    expect(fontsIn(state.doc)).toEqual([null, 'verdana', null]);
  });

  it('reports a font only when all of the selection has it', () => {
    const d = doc(p(text('one', [font('serif')]), text(' two', [font('arial')]), text(' plain')));
    expect(fontFamilyAt(stateWith(d, 1, 4))).toBe('serif');
    expect(fontFamilyAt(stateWith(d, 1, 8))).toBeNull();
    expect(fontFamilyAt(stateWith(d, 9, 14))).toBeNull();
  });

  it('cannot change the font of inline code', () => {
    let state = stateWith(doc(p(text('code', [marks['code'].create()]))), 1, 5);
    state = run(state, setFontFamilyCommand('georgia'));
    expect(fontsIn(state.doc)).toEqual([null]);
  });

  it('offers the document fonts first, with their stacks', () => {
    expect(FONT_FAMILIES.slice(0, 3).map((f) => [f.value, f.stack])).toEqual(
      DOCUMENT_FONTS.map((f) => [f.value, f.stack]),
    );
    expect(new Set(FONT_FAMILIES.map((f) => f.value)).size).toBe(FONT_FAMILIES.length);
  });

  it('checks fonts', () => {
    expect(
      ['georgia', 'sans', 'Georgia', 'georgia; color: red', '', null, 3].map(sanitizeFontFamily),
    ).toEqual(['georgia', 'sans', null, null, null, null, null]);
    expect(fontFamilyForStack(" Georgia, 'Times New Roman', serif ")).toBe('georgia');
    expect(fontFamilyForStack('Georgia')).toBeNull();
  });
});

describe('Font family in HTML and Markdown', () => {
  it('writes a span with the font and its stack, and reads it back', () => {
    const d = doc(p(text('Serif', [font('georgia')]), text(' text')));
    const html = docToHtml(d);
    expect(html).toContain('<span data-font-family="georgia" style="font-family: Georgia');
    expect(htmlToDoc(html).eq(d)).toBe(true);
  });

  it('reads no fonts from other pages, Word or Google Docs: they are the source styling', () => {
    expect(fontsIn(htmlToDoc('<p><span style="font-family: Georgia">web</span></p>'))).toEqual([
      null,
    ]);
    const docs = cleanPastedHtml(
      '<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;font-family:Arial">Docs</span></p></b>',
    );
    expect(fontsIn(htmlToDoc(docs))).toEqual([null]);
  });

  it('never writes unsafe values', () => {
    const d = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'fontFamily', attrs: { font: "x; background: url('y')" } }],
            },
          ],
        },
      ],
    });
    expect(docToHtml(d)).toBe('<p><span>x</span></p>');
    expect(docToMarkdown(d)).toBe('x');
  });

  it('round-trips through Markdown as <span style="font-family">, nested with sizes', () => {
    const size = marks['fontSize'].create({ size: 24 });
    const d = doc(
      p(
        text('Times ', [font('times-new-roman')]),
        text('and large', [size, font('times-new-roman')]),
        text(', mono', [font('mono')]),
        text(' plain'),
      ),
    );
    const md = docToMarkdown(d);
    expect(md).toContain(`<span style="font-family: 'Times New Roman', Times, serif">`);
    expect(markdownToDoc(md).eq(d)).toBe(true);
  });

  it('leaves spans with other fonts as text', () => {
    const d = markdownToDoc('<span style="font-family: Papyrus">x</span>');
    expect(d.textContent).toBe('<span style="font-family: Papyrus">x</span>');
  });
});
