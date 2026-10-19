/**
 * Page view: where each page starts, worked out from the document as laid out
 * on one long sheet. The rules are the print rules (see HTML_DOCUMENT_CSS), so
 * the pages on screen are the printed pages:
 * - a page may start between any two lines of a paragraph, leaving at least
 *   two lines on each page (orphans and widows);
 * - code blocks, quotes, callouts, task items, table rows and images stay
 *   whole when they fit a page;
 * - a heading stays with what follows it;
 * - a page break starts a new page.
 *
 * Measuring the slices (DOM) and showing the pages (spacers) live elsewhere;
 * this is the pure decision, so the rules are unit-tested.
 */

/** Whether a page may start before a slice: freely, only if nothing better fits, or always. */
export type BreakBefore = 'allowed' | 'avoid' | 'forced';

/** A part of the document that does not split further, as laid out on one long sheet. */
export interface PageSlice {
  /** Top and bottom in CSS pixels from the top of the sheet (its top margin included). */
  top: number;
  bottom: number;
  before: BreakBefore;
}

/** A page on screen, in CSS pixels. */
export interface PageFrame {
  height: number;
  marginTop: number;
  marginBottom: number;
  /** The space between two pages. */
  gap: number;
}

export interface PagePlan {
  /** Each page after the first: the slice it starts with, and the space added before that slice. */
  breaks: { slice: number; space: number }[];
  pages: number;
}

/** The space between two pages on screen, in CSS pixels (as in the page layout styles). */
export const PAGE_GAP_PX = 28;

/**
 * Custom properties for the canvas in page view (with `pageLayoutStyle`):
 * the number of pages, which sizes the sheet, and the gap between them.
 */
export function pageViewStyle(pages: number): Record<string, string> {
  return { '--ink-page-count': String(pages), '--ink-page-gap': `${PAGE_GAP_PX}px` };
}

/** Rounding slack, so a slice that fits exactly is not pushed to the next page. */
const SLACK = 0.5;

/**
 * Where pages start. A slice that runs past the bottom margin starts a new
 * page, or the latest slice before it where a page may start freely does
 * (keeping orphans, widows, whole blocks and headings with what follows). A
 * slice taller than a page is left to run over: nothing can be done for it.
 */
export function planPages(slices: readonly PageSlice[], frame: PageFrame): PagePlan {
  const breaks: PagePlan['breaks'] = [];
  const pitch = frame.height + frame.gap;
  let page = 0;
  let shift = 0; // the space added so far
  let start = 0; // the first slice on the current page

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const forced = slice.before === 'forced' && i > start;
    const bottom = page * pitch + frame.height - frame.marginBottom;
    if (!forced && (slice.bottom + shift <= bottom + SLACK || i === start)) continue;

    let at = i;
    if (!forced) {
      let j = i;
      while (j > start && slices[j].before !== 'allowed') j--;
      if (j > start) at = j;
    }
    // The page after the one where the slice before ends (a tall slice runs over several).
    const before = slices[at - 1].bottom + shift;
    page = Math.max(page + 1, Math.floor((before - SLACK) / pitch) + 1);
    const space = page * pitch + frame.marginTop - (slices[at].top + shift);
    breaks.push({ slice: at, space });
    shift += space;
    start = at;
    i = at; // the slices after it are laid out again, on the new page
  }
  return { breaks, pages: page + 1 };
}

/**
 * Whether a page may start before line `index` (from 0) of a paragraph with
 * `count` lines: not when it would leave a single line on either page.
 */
export function lineBreakBefore(index: number, count: number): BreakBefore {
  if (index === 0) return 'allowed';
  return index >= 2 && count - index >= 2 ? 'allowed' : 'avoid';
}
