import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema/schema';
import {
  indentAt,
  indentCommand,
  lineSpacingAt,
  outdentAtStartCommand,
  outdentCommand,
  setBlockTypeKeepingFormat,
  setLineSpacingCommand,
  splitFormattedBlockCommand,
} from './paragraph-format-commands';
import { MAX_INDENT, sanitizeIndent, sanitizeLineSpacing } from './paragraph-format-schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';

const { nodes } = schema;
interface Format {
  align?: string | null;
  indent?: number | null;
  lineSpacing?: number | null;
}
const text = (t: string) => schema.text(t);
const p = (content = '', format: Format = {}) =>
  nodes['paragraph'].create(format, content ? [text(content)] : []);
const h = (level: number, content: string, format: Format = {}) =>
  nodes['heading'].create({ level, ...format }, [text(content)]);
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);
const bulletList = (...items: string[]) =>
  nodes['bullet_list'].create(
    null,
    items.map((t) => nodes['list_item'].create(null, [p(t)])),
  );

function stateWith(d: PMNode, from = 1, to = from): EditorState {
  const state = EditorState.create({ schema, doc: d });
  return state.apply(state.tr.setSelection(TextSelection.create(d, from, to)));
}

function run(state: EditorState, command: (s: EditorState, d?: any) => boolean): EditorState {
  let next = state;
  command(state, (tr: any) => (next = state.apply(tr)));
  return next;
}

const indents = (d: PMNode) => d.children.map((n) => n.attrs['indent'] ?? null);

describe('Paragraph formatting in HTML', () => {
  it('writes indent and line spacing as data attributes and styles, and reads the data attributes back', () => {
    const d = doc(
      p('Indented', { indent: 2 }),
      h(2, 'Spaced', { lineSpacing: 1.5, align: 'center' }),
      p('Plain'),
    );
    const html = docToHtml(d);
    expect(html).toContain('<p data-indent="2" style="margin-left: 3rem;">Indented</p>');
    expect(html).toContain(
      '<h2 data-line-spacing="1.5" style="text-align: center; line-height: 1.8;">Spaced</h2>',
    );
    expect(html).toContain('<p>Plain</p>');
    expect(htmlToDoc(html).eq(d)).toBe(true);
  });

  it('never writes values outside the allow-lists into the HTML', () => {
    const d = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { indent: '2; background:url(x)', lineSpacing: 'normal; color: red' },
          content: [{ type: 'text', text: 'x' }],
        },
        { type: 'paragraph', attrs: { indent: 99, lineSpacing: 3 }, content: [text('y').toJSON()] },
      ],
    });
    expect(docToHtml(d)).toBe('<p>x</p><p>y</p>');
  });

  it('reads only its own data attributes: margins and line heights from other pages are their styling', () => {
    const d = htmlToDoc(
      '<p style="margin-left: 48px; line-height: 2">a</p><p data-indent="12" data-line-spacing="1.3">b</p>',
    );
    expect(d.child(0).attrs).toMatchObject({ indent: null, lineSpacing: null });
    expect(d.child(1).attrs).toMatchObject({ indent: null, lineSpacing: null });
  });

  it('checks values', () => {
    expect([1, '3', MAX_INDENT, 0, MAX_INDENT + 1, 1.5, 'x', null].map(sanitizeIndent)).toEqual([
      1,
      3,
      MAX_INDENT,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect([1, '1.15', 1.5, 2, 1.65, '', undefined].map(sanitizeLineSpacing)).toEqual([
      1,
      1.15,
      1.5,
      2,
      null,
      null,
      null,
    ]);
  });
});

describe('Indent', () => {
  it('indents every paragraph and heading in the selection, up to the limit, and outdents them back', () => {
    let state = stateWith(doc(h(2, 'One'), p('Two'), p('Three')), 2, 8);
    state = run(state, indentCommand);
    state = run(state, indentCommand);
    expect(indents(state.doc)).toEqual([2, 2, null]);
    expect(indentAt(state)).toBe(2);

    state = run(state, outdentCommand);
    expect(indents(state.doc)).toEqual([1, 1, null]);
    state = run(state, outdentCommand);
    expect(indents(state.doc)).toEqual([null, null, null]);
    expect(outdentCommand(state)).toBe(false);

    for (let i = 0; i < MAX_INDENT + 2; i++) state = run(state, indentCommand);
    expect(indents(state.doc)).toEqual([MAX_INDENT, MAX_INDENT, null]);
    expect(indentCommand(state)).toBe(false);
  });

  it('does not apply to code blocks', () => {
    const code = nodes['code_block'].create(null, [text('let x = 1;')]);
    const state = stateWith(doc(code), 2);
    expect(indentCommand(state)).toBe(false);
    expect(outdentCommand(state)).toBe(false);
  });

  it('nests and un-nests list items in a list, like Tab and Shift+Tab', () => {
    let state = stateWith(doc(bulletList('a', 'b')), 8);
    state = run(state, indentCommand);
    const first = state.doc.child(0).child(0);
    expect(first.childCount).toBe(2); // "b" moved into a list under "a"
    expect(first.child(1).type.name).toBe('bullet_list');
    expect(first.child(1).child(0).child(0).attrs['indent']).toBeNull();

    state = run(state, outdentCommand);
    expect(state.doc.child(0).childCount).toBe(2);
  });

  it('Backspace at the start of an indented block takes one level away, then joins as usual', () => {
    let state = stateWith(doc(p('Before'), p('After', { indent: 2 })), 9);
    state = run(state, outdentAtStartCommand);
    expect(indents(state.doc)).toEqual([null, 1]);
    state = run(state, outdentAtStartCommand);
    expect(indents(state.doc)).toEqual([null, null]);
    expect(outdentAtStartCommand(state)).toBe(false);

    // Not in the middle of the text, and not with a selection.
    expect(outdentAtStartCommand(stateWith(doc(p('Text', { indent: 1 })), 3))).toBe(false);
    expect(outdentAtStartCommand(stateWith(doc(p('Text', { indent: 1 })), 1, 3))).toBe(false);
  });
});

describe('Line spacing', () => {
  it('sets the spacing of every paragraph and heading in the selection, and resets it', () => {
    let state = stateWith(doc(h(1, 'Title'), p('Body'), p('Rest')), 2, 9);
    state = run(state, setLineSpacingCommand(2));
    expect(state.doc.children.map((n) => n.attrs['lineSpacing'])).toEqual([2, 2, null]);
    expect(lineSpacingAt(state)).toBe(2);

    state = run(state, setLineSpacingCommand(null));
    expect(state.doc.children.map((n) => n.attrs['lineSpacing'])).toEqual([null, null, null]);
    expect(lineSpacingAt(state)).toBeNull();
  });

  it('does not apply to code blocks', () => {
    const code = nodes['code_block'].create(null, [text('x')]);
    expect(setLineSpacingCommand(1.5)(stateWith(doc(code), 2))).toBe(false);
  });
});

describe('Keeping the formatting', () => {
  const format = { align: 'center', indent: 1, lineSpacing: 1.5 };

  it('keeps alignment, indent and line spacing when a paragraph becomes a heading and back', () => {
    let state = stateWith(doc(p('Formatted', format)), 3);
    state = run(state, setBlockTypeKeepingFormat(nodes['heading'], { level: 2 }));
    expect(state.doc.child(0).type.name).toBe('heading');
    expect(state.doc.child(0).attrs).toMatchObject(format);

    state = run(state, setBlockTypeKeepingFormat(nodes['paragraph']));
    expect(state.doc.child(0).attrs).toEqual(format);
  });

  it('Enter at the end of a formatted block continues the formatting', () => {
    let state = stateWith(doc(h(1, 'Title', format)), 6);
    state = run(state, splitFormattedBlockCommand);
    expect(state.doc.child(1).type.name).toBe('paragraph');
    expect(state.doc.child(1).attrs).toEqual(format);

    state = stateWith(doc(p('Body', { indent: 3 })), 5);
    state = run(state, splitFormattedBlockCommand);
    expect(state.doc.child(1).attrs).toEqual({ align: null, indent: 3, lineSpacing: null });

    // Unformatted blocks and the middle of the text: the default Enter runs.
    expect(splitFormattedBlockCommand(stateWith(doc(p('Body')), 5))).toBe(false);
    expect(splitFormattedBlockCommand(stateWith(doc(p('Body', format)), 3))).toBe(false);
  });
});

describe('Paragraph formatting in Markdown', () => {
  it('round-trips indent and line spacing in the <div> wrapper, with the alignment', () => {
    const quote = nodes['blockquote'].create(null, [p('Quoted', { indent: 1 })]);
    const list = nodes['bullet_list'].create(null, [
      nodes['list_item'].create(null, [p('Item', { lineSpacing: 1.15 })]),
    ]);
    const d = doc(
      h(1, 'Title', { align: 'center', lineSpacing: 1 }),
      p('Indented twice', { indent: 2 }),
      p('Everything', { align: 'right', indent: 8, lineSpacing: 2 }),
      quote,
      list,
      p('Aligned only', { align: 'justify' }),
    );
    const md = docToMarkdown(d);
    expect(md).toContain('<div align="center" style="line-height: 1.2">\n\n# Title\n\n</div>');
    expect(md).toContain('<div style="margin-left: 3rem">\n\nIndented twice\n\n</div>');
    expect(md).toContain(
      '<div align="right" style="margin-left: 12rem; line-height: 2.4">\n\nEverything\n\n</div>',
    );
    expect(md).toContain('<div align="justify">\n\nAligned only\n\n</div>');
    expect(markdownToDoc(md).eq(d)).toBe(true);
  });

  it('leaves wrappers it did not write as text', () => {
    for (const line of [
      '<div style="margin-left: 2rem">', // not a whole indent level
      '<div style="line-height: 1.65">', // not one of the spacings
      '<div style="color: red">',
      '<div>',
    ]) {
      const d = markdownToDoc(`${line}\n\nText\n\n</div>`);
      expect(d.child(0).textContent).toBe(line);
      expect(d.child(1).attrs).toEqual({ align: null, indent: null, lineSpacing: null });
    }
  });
});
