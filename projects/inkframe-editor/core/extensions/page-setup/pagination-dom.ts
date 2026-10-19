import { PX_PER_MM, PageSetup, pageDimensions } from './page-setup';
import { PAGE_GAP_PX, PageFrame } from './pagination';

/*
 * What the editor's page view (pagination.plugin) and the static one
 * (StaticPageView) share: measuring the sheet and lines, and the spacers.
 */

/** Page view needs the room of a tablet or larger; phones reflow. */
export const PAGE_VIEW_MEDIA = '(min-width: 768px)';

export interface Line {
  top: number;
  bottom: number;
  left: number;
}

/** Groups a range's client rects into lines, each as tall as its line box. */
export function groupLines(rects: DOMRect[], lineHeight: number): Line[] {
  const sorted = rects.filter((r) => r.width || r.height).sort((a, b) => a.top - b.top);
  const lines: Line[] = [];
  for (const r of sorted) {
    const middle = (r.top + r.bottom) / 2;
    const line = lines[lines.length - 1];
    if (line && middle >= line.top && middle <= line.bottom) {
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
      line.left = Math.min(line.left, r.left);
    } else {
      lines.push({
        top: Math.min(r.top, middle - lineHeight / 2),
        bottom: Math.max(r.bottom, middle + lineHeight / 2),
        left: r.left,
      });
    }
  }
  return lines;
}

/** The lines of an element's text, in client pixels. */
export function linesOf(content: Element, scale: number): Line[] {
  const range = document.createRange();
  range.selectNodeContents(content);
  const style = getComputedStyle(content);
  const lineHeight =
    (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20) * scale;
  return groupLines(Array.from(range.getClientRects()), lineHeight);
}

/**
 * The first character of a line of `content`'s text: the text node and the
 * offset in it. Found by binary search over the characters' places on
 * screen, so a long paragraph costs a few measurements, not one per letter.
 */
export function lineStartIn(content: Element, line: Line): { text: Text; offset: number } | null {
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
    return { text, offset: low };
  }
  return null;
}

/** A sheet's pages, measured: where they sit on screen and their size. */
export interface PageMeasure {
  frame: PageFrame;
  /** The sheet's top, in client pixels. */
  top: number;
  /** Screen pixels per CSS pixel (the zoom). */
  scale: number;
  /** The height of a page's text area: blocks up to this tall stay whole. */
  room: number;
}

/** Measures the pages of `sheet`, whose `body` has the page margins as padding. */
export function measurePages(sheet: HTMLElement, body: HTMLElement, setup: PageSetup): PageMeasure {
  const style = getComputedStyle(body);
  const marginTop = parseFloat(style.paddingTop) || 0;
  const marginBottom = parseFloat(style.paddingBottom) || 0;
  const height = pageDimensions(setup).height * PX_PER_MM;
  const rect = sheet.getBoundingClientRect();
  return {
    frame: { height, marginTop, marginBottom, gap: PAGE_GAP_PX },
    top: rect.top,
    scale: rect.width / sheet.offsetWidth || 1,
    room: height - marginTop - marginBottom,
  };
}

/**
 * The height of a spacer placed before the block `dom`: `space`, less the
 * margin the spacer stops from collapsing (the smaller of the block's top
 * margin and the previous block's bottom margin).
 */
export function blockSpacerHeight(dom: Element, space: number): number {
  let prev = dom.previousElementSibling;
  while (prev?.classList.contains('ink-page-spacer')) prev = prev.previousElementSibling;
  const marginTop = parseFloat(getComputedStyle(dom).marginTop) || 0;
  const marginBottom = prev ? parseFloat(getComputedStyle(prev).marginBottom) || 0 : 0;
  return space - Math.min(marginTop, marginBottom);
}

/**
 * A spacer: empty space that moves what follows it to the next page. A
 * `span` inside a paragraph (before a line), a `div` before a block, or a
 * table row spanning `columns` columns before a row.
 */
export function createPageSpacer(
  kind: 'inline' | 'block' | 'row',
  height: number,
  columns = 1,
): HTMLElement {
  const px = `${Math.max(0, height)}px`;
  if (kind === 'row') {
    const row = document.createElement('tr');
    row.className = 'ink-page-spacer';
    const cell = row.appendChild(document.createElement('td'));
    cell.colSpan = columns;
    cell.style.height = px;
    return row;
  }
  const el = document.createElement(kind === 'inline' ? 'span' : 'div');
  el.className = 'ink-page-spacer';
  el.style.height = px;
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  return el;
}
