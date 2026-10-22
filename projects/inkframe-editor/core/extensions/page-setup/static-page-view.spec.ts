import { describe, it, expect, afterEach, vi } from 'vitest';
import { DEFAULT_PAGE_SETUP, PX_PER_MM, PageSetup } from './page-setup';
import { StaticPageView } from './static-page-view';
import { PAGE_GAP_PX, pageViewStyle } from './pagination';
import { groupLines } from './pagination-dom';

const A4_HEIGHT = 297 * PX_PER_MM;
const MARGIN = 96;
const PAGES: PageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'pages', paper: 'a4' };

/**
 * A sheet whose blocks are `heights` tall, stacked from the top margin (jsdom
 * has no layout, so each block reports where it would be).
 */
function sheetWith(heights: number[]) {
  const sheet = document.createElement('article');
  sheet.className = 'ink-sheet';
  const body = sheet.appendChild(document.createElement('div'));
  body.className = 'ink-sheet-body';
  body.style.padding = `${MARGIN}px`;
  const rect = (top: number, height: number, width = 794) =>
    ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top }) as DOMRect;
  sheet.getBoundingClientRect = () => rect(0, 2000);
  Object.defineProperty(sheet, 'offsetWidth', { value: 794 });
  let top = MARGIN;
  for (const [i, height] of heights.entries()) {
    const block = body.appendChild(document.createElement('div'));
    block.textContent = `Block ${i + 1}`;
    const at = top;
    block.getBoundingClientRect = () => rect(at, height);
    top += height;
  }
  document.body.appendChild(sheet);
  return { sheet, body };
}

describe('StaticPageView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function layOut(body: HTMLElement, setup: PageSetup, wide = true) {
    vi.stubGlobal('matchMedia', () => ({
      matches: wide,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const pages: number[] = [];
    const view = new StaticPageView(body, (n) => pages.push(n));
    view.setPageSetup(setup);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve));
    return { view, pages };
  }

  it('moves the blocks that do not fit to the next page with spacers', async () => {
    const { body } = sheetWith([500, 500, 500]);
    const { view, pages } = await layOut(body, PAGES);
    expect(pages).toEqual([3]);
    const spacers = Array.from(body.children).filter((el) =>
      el.classList.contains('ink-page-spacer'),
    );
    expect(spacers.map((s) => s.nextElementSibling!.textContent)).toEqual(['Block 2', 'Block 3']);
    // Block 2 starts page 2 at its top margin: it moves from 596 to one page on, plus the margin.
    const pitch = A4_HEIGHT + PAGE_GAP_PX;
    expect(parseFloat((spacers[0] as HTMLElement).style.height)).toBeCloseTo(
      pitch + MARGIN - 596,
      3,
    );
    expect(spacers[0].getAttribute('aria-hidden')).toBe('true');
    // Destroying it takes its spacers out.
    view.destroy();
    expect(body.querySelector('.ink-page-spacer')).toBeNull();
  });

  it('shows no pages in Pageless or on narrow screens', async () => {
    const { body } = sheetWith([500, 500, 500]);
    expect((await layOut(body, DEFAULT_PAGE_SETUP)).pages).toEqual([0]);
    document.body.innerHTML = '';
    const narrow = sheetWith([500, 500, 500]);
    expect((await layOut(narrow.body, PAGES, false)).pages).toEqual([0]);
    expect(narrow.body.querySelector('.ink-page-spacer')).toBeNull();
  });
});

describe('page view helpers', () => {
  it('groups client rects into lines', () => {
    const r = (top: number, bottom: number, left: number) =>
      ({ top, bottom, left, right: left + 10, width: 10, height: bottom - top }) as DOMRect;
    // Two runs on the first line, one on the second; each line as tall as the line height.
    const lines = groupLines([r(40, 58, 0), r(0, 20, 0), r(2, 18, 50)], 20);
    expect(lines).toEqual([
      { top: 0, bottom: 20, left: 0 },
      { top: 39, bottom: 59, left: 0 },
    ]);
  });

  it('gives the canvas the number of pages and the gap', () => {
    expect(pageViewStyle(4)).toEqual({ '--ink-page-count': '4', '--ink-page-gap': '28px' });
  });
});
