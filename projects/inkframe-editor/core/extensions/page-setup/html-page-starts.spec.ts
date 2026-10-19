import { describe, it, expect } from 'vitest';
import { schema } from '../../schema/schema';
import { docToHtml, sanitizeHtml } from '../../io/html';
import { createPageSpacer } from './pagination-dom';
import { pageStartsInHtml, positionAtOffset, spacerOffsets } from './html-page-starts';

const t = (text: string) => ({ type: 'text', text });
const p = (...content: object[]) => ({ type: 'paragraph', content });
const cell = (text: string) => ({ type: 'table_cell', content: [p(t(text))] });

// Every kind of content the count has to agree on.
const doc = schema.nodeFromJSON({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [t('Title')] },
    p(t('first line'), { type: 'hard_break' }, t('after a break second part')),
    p(t('a picture '), { type: 'image', attrs: { src: 'data:image/png;base64,AA==' } }),
    {
      type: 'code_block',
      attrs: { language: 'javascript' },
      content: [t('const x = 1;\nlet y = 2;')],
    },
    { type: 'horizontal_rule' },
    { type: 'page_break' },
    p(), // empty
    {
      type: 'task_list',
      content: ['one', 'two'].map((text) => ({ type: 'task_item', content: [p(t(text))] })),
    },
    {
      type: 'table',
      content: ['R1', 'R2', 'R3'].map((r) => ({
        type: 'table_row',
        content: [cell(r), cell(r + 'b')],
      })),
    },
    { type: 'callout', attrs: { type: 'info' }, content: [p(t('inside a callout'))] },
    p(t('the end')),
  ],
});

/** The document as the reader shows it, with white space between blocks as some HTML has. */
function render(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(docToHtml(doc));
  for (const child of Array.from(root.children)) child.before(document.createTextNode('\n  '));
  return root;
}

/** Puts a spacer before the first character of `text` in `root`. */
function spacerBeforeText(root: HTMLElement, text: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const i = node.data.indexOf(text);
    if (i < 0) continue;
    const after = i ? node.splitText(i) : node;
    after.before(createPageSpacer('inline', 10));
    return;
  }
  throw new Error(`"${text}" is not in the HTML`);
}

describe('page starts of a document shown as HTML', () => {
  it('finds a page that starts inside a paragraph, after a line break', () => {
    const root = render();
    spacerBeforeText(root, 'second part');
    const [pos] = pageStartsInHtml(root, doc);
    expect(doc.textBetween(pos, pos + 11)).toBe('second part');
  });

  it('finds pages that start before a block, a list item and a table row', () => {
    const root = render();
    root.querySelector('pre')!.before(createPageSpacer('block', 10));
    root.querySelectorAll('li')[1].before(createPageSpacer('block', 10));
    root.querySelectorAll('tr')[2].before(createPageSpacer('row', 10, 2));
    root.querySelector('.callout')!.before(createPageSpacer('block', 10));
    const starts = pageStartsInHtml(root, doc);
    expect(starts).toHaveLength(4);
    const where = starts.map((pos) => {
      const $pos = doc.resolve(pos);
      return [$pos.parent.type.name, $pos.parentOffset, $pos.parent.textContent];
    });
    expect(where).toEqual([
      ['code_block', 0, 'const x = 1;\nlet y = 2;'],
      ['paragraph', 0, 'two'],
      ['paragraph', 0, 'R3'],
      ['paragraph', 0, 'inside a callout'],
    ]);
  });

  it('counts the HTML and the document alike, to the end', () => {
    const root = render();
    spacerBeforeText(root, 'the end');
    const [offset] = spacerOffsets(root);
    expect(doc.textBetween(positionAtOffset(doc, offset)!, doc.content.size)).toBe('the end');
    expect(positionAtOffset(doc, 1e6)).toBeNull();
  });
});
