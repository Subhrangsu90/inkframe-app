import { describe, it, expect } from 'vitest';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema/schema';
import { withPageStarts } from './page-starts';
import { docToHtmlDocument } from './html-document';

const t = (text: string) => ({ type: 'text', text });
const p = (text: string) => ({ type: 'paragraph', content: [t(text)] });
const li = (...content: object[]) => ({ type: 'list_item', content });
const ol = (order: number, ...items: object[]) => ({
  type: 'ordered_list',
  attrs: { order },
  content: items,
});
const row = (text: string) => ({
  type: 'table_row',
  content: [{ type: 'table_cell', content: [p(text)] }],
});
const docOf = (...content: object[]) => schema.nodeFromJSON({ type: 'doc', content });

/** The position of `text` in the document (the position before its first letter). */
function posOf(doc: PMNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    const i = node.isText ? node.text!.indexOf(text) : -1;
    if (i >= 0) found = pos + i;
    return true;
  });
  if (found < 0) throw new Error(`"${text}" is not in the document`);
  return found;
}

/** The top-level blocks, each as its type and text, with lists' first numbers. */
const outline = (doc: PMNode) =>
  doc.children.map((node) =>
    node.type.name === 'ordered_list'
      ? `${node.type.name}(${node.attrs['order']}): ${node.textContent}`
      : `${node.type.name}: ${node.textContent}`,
  );

describe('withPageStarts', () => {
  it('returns the document itself without starts', () => {
    const doc = docOf(p('One'), p('Two'));
    expect(withPageStarts(doc, [])).toBe(doc);
  });

  it('breaks before a block that starts a page', () => {
    const doc = docOf(p('One'), p('Two'));
    const next = withPageStarts(doc, [posOf(doc, 'Two')]);
    expect(outline(next)).toEqual(['paragraph: One', 'page_break: ', 'paragraph: Two']);
  });

  it('splits a paragraph at a line that starts a page', () => {
    const doc = docOf(p('First line second line'));
    const next = withPageStarts(doc, [posOf(doc, 'second')]);
    expect(outline(next)).toEqual([
      'paragraph: First line ',
      'page_break: ',
      'paragraph: second line',
    ]);
    next.check();
  });

  it('keeps counting in the second half of a numbered list', () => {
    const doc = docOf(ol(3, li(p('a')), li(p('b')), li(p('c')), li(p('d'))));
    const next = withPageStarts(doc, [posOf(doc, 'c')]);
    expect(outline(next)).toEqual(['ordered_list(3): ab', 'page_break: ', 'ordered_list(5): cd']);
  });

  it('shows the number of an item cut in two again on the next page', () => {
    const doc = docOf(ol(1, li(p('a')), li(p('b1 b2')), li(p('c'))));
    const next = withPageStarts(doc, [posOf(doc, 'b2')]);
    expect(outline(next)).toEqual([
      'ordered_list(1): ab1 ',
      'page_break: ',
      'ordered_list(2): b2c',
    ]);
  });

  it('keeps counting in a numbered list inside a quote', () => {
    const doc = docOf({ type: 'blockquote', content: [ol(2, li(p('a')), li(p('b')), li(p('c')))] });
    const next = withPageStarts(doc, [posOf(doc, 'c')]);
    expect(outline(next)).toEqual(['blockquote: ab', 'page_break: ', 'blockquote: c']);
    expect(next.child(2).firstChild!.attrs['order']).toBe(4);
    next.check();
  });

  it('breaks before a list whose nested list starts a page', () => {
    const doc = docOf(p('intro'), ol(1, li(p('a'), ol(1, li(p('x')), li(p('y'))))));
    const next = withPageStarts(doc, [posOf(doc, 'y')]);
    expect(outline(next)).toEqual(['paragraph: intro', 'page_break: ', 'ordered_list(1): axy']);
  });

  it('never breaks before the first block', () => {
    const doc = docOf(ol(1, li(p('a'), ol(1, li(p('x')), li(p('y'))))));
    expect(withPageStarts(doc, [posOf(doc, 'y')]).eq(doc)).toBe(true);
  });

  it('splits a table between rows', () => {
    const doc = docOf({ type: 'table', content: [row('r1'), row('r2'), row('r3'), row('r4')] });
    const before = doc.firstChild!;
    const start = 1 + before.child(0).nodeSize + before.child(1).nodeSize;
    const next = withPageStarts(doc, [start]);
    expect(outline(next)).toEqual(['table: r1r2', 'page_break: ', 'table: r3r4']);
    next.check();
  });

  it('splits a code block at a line without leaving an empty line', () => {
    const code = { type: 'code_block', content: [t('one\ntwo\nthree')] };
    const doc = docOf(code);
    const next = withPageStarts(doc, [posOf(doc, 'two')]);
    expect(outline(next)).toEqual(['code_block: one', 'page_break: ', 'code_block: two\nthree']);
  });

  it('keeps the code as it is when the page starts before the code block instead', () => {
    const code = { type: 'code_block', content: [t('one\ntwo')] };
    const doc = docOf(p('intro'), ol(1, li(p('a'), code)));
    const next = withPageStarts(doc, [posOf(doc, 'two')]);
    expect(outline(next)).toEqual([
      'paragraph: intro',
      'page_break: ',
      'ordered_list(1): aone\ntwo',
    ]);
  });

  it('breaks after a block whose end starts a page, and never at the end', () => {
    const doc = docOf(p('One'), p('Two'));
    const endOfOne = posOf(doc, 'One') + 3;
    expect(outline(withPageStarts(doc, [endOfOne]))).toEqual([
      'paragraph: One',
      'page_break: ',
      'paragraph: Two',
    ]);
    expect(withPageStarts(doc, [doc.content.size - 1]).eq(doc)).toBe(true);
  });

  it('adds nothing after a page break', () => {
    const doc = docOf(p('One'), { type: 'page_break' }, p('Two'));
    expect(withPageStarts(doc, [posOf(doc, 'Two')]).eq(doc)).toBe(true);
  });

  it('applies several starts and ignores repeats and positions outside the document', () => {
    const doc = docOf(p('One'), p('Two'), p('Three'));
    const two = posOf(doc, 'Two');
    const next = withPageStarts(doc, [posOf(doc, 'Three'), two, two, 0, -4, 1e6, 2.5]);
    expect(outline(next)).toEqual([
      'paragraph: One',
      'page_break: ',
      'paragraph: Two',
      'page_break: ',
      'paragraph: Three',
    ]);
  });

  it('prints the pages through docToHtmlDocument', () => {
    const doc = docOf(p('One'), p('Two'));
    const html = docToHtmlDocument(doc, { pageStarts: [posOf(doc, 'Two')] });
    expect(html).toMatch(/<p>One<\/p>\s*<div class="ink-page-break"[^>]*><\/div>\s*<p>Two<\/p>/);
    expect(docToHtmlDocument(doc)).not.toContain('<div class="ink-page-break"');
  });
});
