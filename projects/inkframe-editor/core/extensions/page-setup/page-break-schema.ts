import { NodeSpec } from 'prosemirror-model';

/** A style that forces a new page, as Markdown converters and some editors write breaks. */
const FORCED_BREAK = /(?:page-)?break-(?:before|after)\s*:\s*(?:always|page)/i;

/**
 * Where printing starts a new page. A block of its own, only at the top level
 * of a document (the `doc` node allows it when the schema has it). Shown as a
 * dashed line labeled "Page break".
 */
export const page_break: NodeSpec = {
  atom: true,
  selectable: true,
  parseDOM: [
    { tag: 'div.ink-page-break' },
    {
      // An empty block that forces a break (a wrapper with content stays content).
      tag: 'div',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return FORCED_BREAK.test(el.getAttribute('style') ?? '') && !el.textContent?.trim()
          ? {}
          : false;
      },
    },
  ],
  toDOM: () => ['div', { class: 'ink-page-break', role: 'separator', 'aria-label': 'Page break' }],
};

/** The `doc` node's content when the schema has page breaks. */
export const DOC_CONTENT_WITH_PAGE_BREAKS = '(block | page_break)+';
