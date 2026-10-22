import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '../../schema/schema';
import {
  BreakBefore,
  PageFrame,
  PageSlice,
  editScope,
  lineBreakBefore,
  planPages,
} from './pagination';

// A small page: 100px tall, 10px margins, so 80px of text; 20px between pages.
const frame: PageFrame = { height: 100, marginTop: 10, marginBottom: 10, gap: 20 };
const pitch = frame.height + frame.gap;

/** Slices of `height` px, one after another from the top margin, with `space` px between them. */
function stack(heights: number[], before: BreakBefore[] = [], space = 0): PageSlice[] {
  let y = frame.marginTop;
  return heights.map((h, i) => {
    const slice = { top: y, bottom: y + h, before: before[i] ?? 'allowed' };
    y += h + space;
    return slice;
  });
}

/** Where each slice lands after the plan's spaces, as [page, top on that page]. */
function placed(slices: PageSlice[], plan: ReturnType<typeof planPages>) {
  let shift = 0;
  return slices.map((s, i) => {
    const b = plan.breaks.find((x) => x.slice === i);
    if (b) shift += b.space;
    const top = s.top + shift;
    const page = Math.floor(top / pitch);
    return [page, Math.round(top - page * pitch)];
  });
}

describe('planPages', () => {
  it('keeps a document that fits on one page', () => {
    expect(planPages(stack([20, 20, 20]), frame)).toEqual({ breaks: [], pages: 1 });
  });

  it('starts a new page with the slice that runs past the bottom margin, at the top margin', () => {
    const slices = stack([30, 30, 30, 30]);
    const plan = planPages(slices, frame);
    expect(plan.pages).toBe(2);
    expect(plan.breaks.map((b) => b.slice)).toEqual([2]);
    expect(placed(slices, plan)).toEqual([
      [0, 10],
      [0, 40],
      [1, 10],
      [1, 40],
    ]);
  });

  it('drops the space between two blocks at a page start (it stays on the page before)', () => {
    const slices = stack([30, 30, 30], [], 15);
    const plan = planPages(slices, frame);
    expect(placed(slices, plan)[2]).toEqual([1, 10]);
  });

  it('moves back to the last slice before which a page may start (whole blocks, orphans, headings)', () => {
    // A heading (20) then a paragraph whose first line may not be split from it.
    const slices = stack([30, 20, 20, 20], ['allowed', 'allowed', 'avoid', 'avoid']);
    const plan = planPages(slices, frame);
    expect(plan.breaks.map((b) => b.slice)).toEqual([1]);
    expect(placed(slices, plan).map(([p]) => p)).toEqual([0, 1, 1, 1]);
  });

  it('breaks right before the slice that does not fit when nowhere else is allowed', () => {
    const slices = stack([30, 30, 30], ['allowed', 'avoid', 'avoid']);
    expect(planPages(slices, frame).breaks.map((b) => b.slice)).toEqual([2]);
  });

  it('lets a slice taller than a page run over, and starts the next one on a new page', () => {
    const slices = stack([150, 20]);
    const plan = planPages(slices, frame);
    expect(plan.breaks.map((b) => b.slice)).toEqual([1]);
    expect(placed(slices, plan)[1]).toEqual([2, 10]);
    expect(plan.pages).toBe(3);
  });

  it('starts a new page after a page break, even with room left', () => {
    const slices = stack([10, 10, 10], ['allowed', 'allowed', 'forced']);
    const plan = planPages(slices, frame);
    expect(plan.breaks.map((b) => b.slice)).toEqual([2]);
    expect(placed(slices, plan)[2]).toEqual([1, 10]);
  });

  it('lays out the moved slices again on the new page, across several pages', () => {
    const slices = stack(Array(10).fill(30));
    const plan = planPages(slices, frame);
    expect(plan.pages).toBe(5);
    expect(placed(slices, plan).map(([p]) => p)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('lineBreakBefore', () => {
  it('keeps at least two lines of a paragraph on each page', () => {
    expect([0, 1, 2, 3, 4].map((i) => lineBreakBefore(i, 5))).toEqual([
      'allowed',
      'avoid',
      'allowed',
      'allowed',
      'avoid',
    ]);
    expect([0, 1, 2].map((i) => lineBreakBefore(i, 3))).toEqual(['allowed', 'avoid', 'avoid']);
  });
});

describe('editScope', () => {
  const t = (text: string) => ({ type: 'text', text });
  const p = (text: string) => ({ type: 'paragraph', content: [t(text)] });
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: [
      p('First paragraph'),
      p('aa'),
      { type: 'bullet_list', content: [{ type: 'list_item', content: [p('Item')] }] },
    ],
  });
  const state = EditorState.create({ doc });
  /** The position of `text`'s first letter. */
  const at = (text: string) => {
    let found = -1;
    doc.descendants((node, pos) => {
      const i = node.isText ? node.text!.indexOf(text) : -1;
      if (found < 0 && i >= 0) found = pos + i;
      return found < 0;
    });
    return found;
  };
  const textblockOf = (text: string) => doc.resolve(at(text)).before();

  it('finds no change in the same document', () => {
    expect(editScope(doc, doc)).toBe('none');
    expect(editScope(doc, state.tr.insertText('x', 3).delete(3, 4).doc)).toBe('none');
  });

  it('finds typing and deleting inside one paragraph, also in a list', () => {
    expect(editScope(doc, state.tr.insertText('new ', at('paragraph')).doc)).toEqual({
      textblock: textblockOf('First'),
    });
    expect(editScope(doc, state.tr.delete(at('First'), at('First') + 6).doc)).toEqual({
      textblock: textblockOf('First'),
    });
    // Repeated letters: the change can be found at either end of them.
    expect(editScope(doc, state.tr.insertText('a', at('aa') + 1).doc)).toEqual({
      textblock: textblockOf('aa'),
    });
    expect(editScope(doc, state.tr.insertText('s', at('Item') + 4).doc)).toEqual({
      textblock: textblockOf('Item'),
    });
    const bold = schema.marks['strong'].create();
    expect(editScope(doc, state.tr.addMark(at('First'), at('First') + 5, bold).doc)).toEqual({
      textblock: textblockOf('First'),
    });
  });

  it('finds changes that reach past one paragraph', () => {
    // Enter splits a paragraph; Backspace at the start joins two.
    expect(editScope(doc, state.tr.split(at('paragraph')).doc)).toBe('other');
    expect(editScope(doc, state.tr.join(textblockOf('aa')).doc)).toBe('other');
    // Two paragraphs, a paragraph's own attributes, the page setup.
    const two = state.tr.insertText('x', at('First')).insertText('y', at('aa') + 1).doc;
    expect(editScope(doc, two)).toBe('other');
    const centered = state.tr.setNodeAttribute(textblockOf('aa'), 'align', 'center').doc;
    expect(editScope(doc, centered)).toBe('other');
    const pages = state.tr.setDocAttribute('page', { layout: 'pages' }).doc;
    expect(editScope(doc, pages)).toBe('other');
  });
});
