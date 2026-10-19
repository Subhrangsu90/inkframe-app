import { PageSetup } from './page-setup';
import { BreakBefore, PageSlice, lineBreakBefore, planPages } from './pagination';
import {
  Line,
  PAGE_VIEW_MEDIA,
  blockSpacerHeight,
  createPageSpacer,
  linesOf,
  measurePages,
} from './pagination-dom';

/** Where a spacer goes in rendered HTML. */
type Anchor =
  | { kind: 'block'; el: Element } // before a block
  | { kind: 'start'; el: Element } // at the start of a paragraph
  | { kind: 'text'; text: Text; offset: number } // before a character
  | { kind: 'row'; row: HTMLTableRowElement; columns: number }; // before a table row

interface Slice extends PageSlice {
  anchor(): Anchor | null;
}

const TEXTBLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
/** Elements that hold blocks: page view looks inside those that do not fit a page. */
const BLOCK_TAGS = new Set([
  ...TEXTBLOCKS,
  'PRE',
  'TABLE',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'DIV',
  'HR',
  'IMG',
]);

/**
 * Measures rendered document HTML (`docToHtml`) into slices, in sheet CSS
 * pixels, with the same rules as the editor's page view.
 */
class SliceCollector {
  readonly slices: Slice[] = [];
  private pending: BreakBefore = 'allowed';

  constructor(
    private readonly sheetTop: number,
    private readonly scale: number,
    private readonly room: number,
  ) {}

  private y(clientY: number): number {
    return (clientY - this.sheetTop) / this.scale;
  }

  private add(top: number, bottom: number, before: BreakBefore, anchor: () => Anchor | null) {
    const pending = this.pending;
    this.pending = 'allowed';
    const merged: BreakBefore =
      pending === 'forced' || before === 'forced'
        ? 'forced'
        : pending === 'avoid' || before === 'avoid'
          ? 'avoid'
          : 'allowed';
    this.slices.push({ top, bottom, before: merged, anchor });
  }

  blocks(parent: Element): void {
    for (const child of Array.from(parent.children)) this.block(child);
  }

  private block(el: Element): void {
    const rect = el.getBoundingClientRect();
    if (!rect.height) return;
    const top = this.y(rect.top);
    const bottom = this.y(rect.bottom);
    const tag = el.tagName;
    const fits = bottom - top <= this.room;
    const whole = (): Anchor => ({ kind: 'block', el });

    if (el.classList.contains('ink-page-break')) {
      this.add(top, bottom, 'allowed', whole);
      this.pending = 'forced';
      return;
    }
    if (el instanceof HTMLTableElement) return this.table(el, top, whole);
    if (tag === 'PRE') {
      if (fits) return this.add(top, bottom, 'allowed', whole);
      return this.lines(el.querySelector('code') ?? el, { top, bottom, whole });
    }
    if (TEXTBLOCKS.has(tag)) {
      this.lines(el, null);
      if (HEADINGS.has(tag)) this.pending = 'avoid'; // a heading stays with what follows
      return;
    }
    // Blocks that stay whole when they fit, as in the editor. A page before a
    // list item starts before all of it, so its marker or checkbox moves too.
    if ((tag === 'BLOCKQUOTE' || tag === 'LI' || el.classList.contains('callout')) && fits) {
      return this.add(top, bottom, 'allowed', whole);
    }
    if (!Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName))) {
      return this.add(top, bottom, 'allowed', whole);
    }
    this.blocks(el);
  }

  /** A paragraph's lines (a code block's when taller than a page). */
  private lines(
    content: Element,
    box: { top: number; bottom: number; whole: () => Anchor } | null,
  ): void {
    const lines = linesOf(content, this.scale);
    const start = (): Anchor => ({ kind: 'start', el: content });
    if (!lines.length) {
      const r = content.getBoundingClientRect();
      this.add(this.y(r.top), this.y(r.bottom), 'allowed', box?.whole ?? start);
      return;
    }
    lines.forEach((line, i) => {
      const top = box && i === 0 ? box.top : this.y(line.top);
      const bottom = box && i === lines.length - 1 ? box.bottom : this.y(line.bottom);
      const anchor = i > 0 ? () => lineStart(content, line) : (box?.whole ?? start);
      this.add(top, bottom, lineBreakBefore(i, lines.length), anchor);
    });
  }

  /** Table rows; a page may start between any two. A page before the first row moves the table. */
  private table(table: HTMLTableElement, top: number, whole: () => Anchor): void {
    const rows = Array.from(table.rows);
    const columns = Math.max(
      1,
      ...rows.map((row) => Array.from(row.cells).reduce((n, cell) => n + cell.colSpan, 0)),
    );
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      const anchor = i === 0 ? whole : (): Anchor => ({ kind: 'row', row, columns });
      this.add(i === 0 ? top : this.y(r.top), this.y(r.bottom), 'allowed', anchor);
    });
  }
}

/** The first character of a line of `content`'s text, found from its place on screen. */
function lineStart(content: Element, line: Line): Anchor | null {
  const range = document.createRange();
  // Whether the character at `offset` is on the line or below it.
  const onOrBelow = (text: Text, offset: number) => {
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    const rects = range.getClientRects();
    const r = rects[rects.length - 1];
    return !!r && (r.top + r.bottom) / 2 >= line.top;
  };
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const length = text.data.length;
    if (!length || !onOrBelow(text, length - 1)) continue; // all of it above the line
    let low = 0;
    let high = length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (onOrBelow(text, middle)) high = middle;
      else low = middle + 1;
    }
    return { kind: 'text', text, offset: low };
  }
  return null;
}

function insertSpacer(anchor: Anchor, height: number): void {
  switch (anchor.kind) {
    case 'block':
      anchor.el.before(createPageSpacer('block', height));
      break;
    case 'start':
      anchor.el.prepend(createPageSpacer('inline', height));
      break;
    case 'text': {
      const after = anchor.offset ? anchor.text.splitText(anchor.offset) : anchor.text;
      after.before(createPageSpacer('inline', height));
      break;
    }
    case 'row':
      anchor.row.before(createPageSpacer('row', height, anchor.columns));
      break;
  }
}

/**
 * Page view for a document rendered as HTML (`docToHtml`), such as a reader
 * or a version preview: shows a Pages document as separate pages, split like
 * the editor's page view, with spacer elements inserted into the HTML.
 *
 * `body` is the element that holds the HTML, inside the same canvas as the
 * editor's (`.ink-canvas` > `.ink-sheet` > `.ink-sheet-body`), with the
 * document's `pageLayoutStyle`. Lays the pages out again when the HTML, the
 * width, the fonts or an image change, and reports the number of pages
 * (0 when off: Pageless, or under 768px).
 */
export class StaticPageView {
  private setup: PageSetup | null = null;
  private frame = 0;
  private pages = -1;
  private width = 0;
  private readonly wide = typeof matchMedia === 'function' ? matchMedia(PAGE_VIEW_MEDIA) : null;
  private readonly resize =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          // Only a new width moves lines; the spacers make it taller.
          const width = this.body.offsetWidth;
          if (width !== this.width) {
            this.width = width;
            this.schedule();
          }
        })
      : null;
  // New HTML replaces the body's children.
  private readonly mutations =
    typeof MutationObserver === 'function' ? new MutationObserver(() => this.schedule()) : null;
  private readonly onChange = () => this.schedule();

  constructor(
    private readonly body: HTMLElement,
    private readonly onPages: (pages: number) => void,
  ) {
    this.resize?.observe(body);
    this.mutations?.observe(body, { childList: true });
    this.wide?.addEventListener('change', this.onChange);
    // Images change the layout when they load, and so do fonts.
    body.addEventListener('load', this.onChange, true);
    void document.fonts?.ready.then(this.onChange);
  }

  /** The document's page setup: pages in Pages layout, none in Pageless. */
  setPageSetup(setup: PageSetup): void {
    this.setup = setup;
    this.schedule();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.mutations?.disconnect();
    this.wide?.removeEventListener('change', this.onChange);
    this.body.removeEventListener('load', this.onChange, true);
    this.clear();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layOut());
  }

  private clear(): void {
    const spacers = this.body.querySelectorAll('.ink-page-spacer');
    spacers.forEach((spacer) => spacer.remove());
    if (spacers.length) this.body.normalize(); // joins the text split at line starts
  }

  private layOut(): void {
    this.clear();
    const sheet = this.body.closest<HTMLElement>('.ink-sheet');
    let pages = 0;
    if (sheet && this.setup?.layout === 'pages' && this.wide?.matches) {
      const page = measurePages(sheet, this.body, this.setup);
      const collector = new SliceCollector(page.top, page.scale, page.room);
      collector.blocks(this.body);
      const plan = planPages(collector.slices, page.frame);
      // Find every place first, measured without spacers; then insert from
      // the end, so splitting a text keeps the places before it valid.
      const spacers: { anchor: Anchor; height: number }[] = [];
      for (const { slice, space } of plan.breaks) {
        const anchor = collector.slices[slice].anchor();
        if (!anchor) continue;
        const height = anchor.kind === 'block' ? blockSpacerHeight(anchor.el, space) : space;
        spacers.push({ anchor, height });
      }
      for (const { anchor, height } of spacers.reverse()) insertSpacer(anchor, height);
      pages = plan.pages;
    }
    this.mutations?.takeRecords(); // its own changes
    if (pages !== this.pages) {
      this.pages = pages;
      this.onPages(pages);
    }
  }
}
