import { describe, it, expect } from 'vitest';
import { Fragment, Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../schema/schema';
import { insertPageBreakCommand } from './page-setup-commands';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { docToHtml, htmlToDoc } from '../../io/html';

const p = (text = '') => ({
  type: 'paragraph',
  attrs: { align: null, indent: null, lineSpacing: null },
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
const doc = (...content: unknown[]) => schema.nodeFromJSON({ type: 'doc', content });
const pageBreak = { type: 'page_break' };

/** Runs the command with the cursor at `pos`; returns the document and where the cursor ends up. */
function insertAt(node: PMNode, pos: number) {
  let state = EditorState.create({ schema, doc: node });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  let result: EditorState | null = null;
  const handled = insertPageBreakCommand(state, (tr) => (result = state.apply(tr)));
  const after = result as EditorState | null;
  return {
    handled,
    json: after?.doc.toJSON().content,
    cursorText: after?.selection.$from.parent.textContent,
    cursorOffset: after?.selection.$from.parentOffset,
  };
}

describe('insertPageBreakCommand', () => {
  it('splits a paragraph at the cursor: the rest starts the new page', () => {
    const r = insertAt(doc(p('abcd')), 3);
    expect(r.json).toEqual([p('ab'), pageBreak, p('cd')]);
    expect([r.cursorText, r.cursorOffset]).toEqual(['cd', 0]);
  });

  it('at the end of a paragraph, adds a line to type on after the break', () => {
    const r = insertAt(doc(p('abcd')), 5);
    expect(r.json).toEqual([p('abcd'), pageBreak, p()]);
    expect(r.cursorText).toBe('');
  });

  it('at the start of a paragraph, or on an empty line, goes before it', () => {
    expect(insertAt(doc(p('abcd')), 1).json).toEqual([pageBreak, p('abcd')]);
    const r = insertAt(doc(p('x'), p()), 4);
    expect(r.json).toEqual([p('x'), pageBreak, p()]);
  });

  it('in a list, goes after the whole list (page breaks are top-level blocks)', () => {
    const list = {
      type: 'bullet_list',
      content: [{ type: 'list_item', content: [p('one')] }],
    };
    const r = insertAt(doc(list, p('next')), 4);
    expect(r.json?.map((n: any) => n.type)).toEqual(['bullet_list', 'page_break', 'paragraph']);
    expect(r.cursorText).toBe('next');
  });

  it('does nothing in a code block, where Mod-Enter leaves the block instead', () => {
    const code = { type: 'code_block', content: [{ type: 'text', text: 'x = 1' }] };
    expect(insertAt(doc(code), 2).handled).toBe(false);
  });

  it('is allowed only at the top level', () => {
    const node = schema.nodes['page_break'].create();
    expect(schema.topNodeType.validContent(Fragment.from([node]))).toBe(true);
    expect(schema.nodes['list_item'].validContent(Fragment.from([node]))).toBe(false);
    expect(schema.nodes['callout'].validContent(Fragment.from([node]))).toBe(false);
  });
});

describe('page breaks in Markdown and HTML', () => {
  const withBreak = doc(p('before'), pageBreak, p('after'));

  it('round-trips through Markdown as an HTML line', () => {
    const markdown = docToMarkdown(withBreak);
    expect(markdown).toBe('before\n\n<div class="ink-page-break"></div>\n\nafter');
    expect(markdownToDoc(markdown).toJSON()).toEqual(withBreak.toJSON());
  });

  it('reads the line as text where a page break cannot be (inside a list)', () => {
    const md = '* <div class="ink-page-break"></div>';
    const types: string[] = [];
    markdownToDoc(md).descendants((n) => void types.push(n.type.name));
    expect(types).not.toContain('page_break');
  });

  it('round-trips through HTML, and reads forced breaks from other tools', () => {
    const html = docToHtml(withBreak);
    expect(html).toContain('<div class="ink-page-break" role="separator" aria-label="Page break">');
    expect(htmlToDoc(html).toJSON()).toEqual(withBreak.toJSON());

    const other = htmlToDoc('<p>a</p><div style="page-break-after: always"></div><p>b</p>');
    expect(other.child(1).type.name).toBe('page_break');
  });

  it('keeps the content of a wrapper that forces a break', () => {
    const wrapped = htmlToDoc('<div style="break-after: page"><p>kept</p></div>');
    expect(wrapped.textContent).toBe('kept');
  });
});
