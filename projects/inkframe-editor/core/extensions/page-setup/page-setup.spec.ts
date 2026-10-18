import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  MARGIN_PRESETS,
  PAGE_COLORS,
  PageSetup,
  defaultPaperForLocale,
  findPageColor,
  fitMargins,
  marginPresetOf,
  mmToUnits,
  normalizePageSetup,
  normalizeZoom,
  pageDimensions,
  pageLayoutStyle,
  pageRuleCss,
  pageSetupLabel,
  resolveZoom,
  unitsToMm,
} from './page-setup';

const a4Pages: PageSetup = {
  ...DEFAULT_PAGE_SETUP,
  layout: 'pages',
  paper: 'a4',
  orientation: 'landscape',
  margins: { top: 20, right: 15, bottom: 20, left: 15 },
};

describe('normalizePageSetup', () => {
  it('keeps a valid setup as it is', () => {
    expect(normalizePageSetup(a4Pages)).toEqual(a4Pages);
    expect(normalizePageSetup(DEFAULT_PAGE_SETUP)).toEqual(DEFAULT_PAGE_SETUP);
  });

  it('returns null when there is no setup object', () => {
    for (const raw of [null, undefined, 'pages', 42, true, ['pages']]) {
      expect(normalizePageSetup(raw)).toBeNull();
    }
  });

  it('replaces malformed fields from a share link with the defaults', () => {
    const setup = normalizePageSetup({
      layout: 'scroll',
      paper: 'tabloid',
      orientation: 'sideways',
      margins: { top: 'wide', right: -5, bottom: Number.NaN, left: Infinity },
      sideMargins: { left: 2, right: '0.2' },
      color: 'red; background: url(https://tracker)',
      printColor: 'yes',
      extra: { injected: true },
    });
    expect(setup).toEqual({
      layout: 'pageless',
      paper: 'a4',
      orientation: 'portrait',
      margins: { top: 25.4, right: 0, bottom: 25.4, left: 25.4 },
      sideMargins: { left: 0.4, right: 0.1 },
      color: null,
      printColor: false,
    });
  });

  it('fills in missing fields', () => {
    expect(normalizePageSetup({ layout: 'pages' })).toEqual({
      ...DEFAULT_PAGE_SETUP,
      layout: 'pages',
    });
  });

  it('keeps a page color name, which is never a CSS value', () => {
    expect(normalizePageSetup({ color: 'cream' })?.color).toBe('cream');
    expect(normalizePageSetup({ color: '#fff' })?.color).toBeNull();
  });

  it('scales margins down so they leave at least 50 mm of text width and height', () => {
    const setup = normalizePageSetup({
      layout: 'pages',
      paper: 'a5',
      margins: { top: 100, right: 60, bottom: 100, left: 60 },
    })!;
    const { width, height } = pageDimensions(setup);
    expect(width - setup.margins.left - setup.margins.right).toBeCloseTo(50, 1);
    expect(height - setup.margins.top - setup.margins.bottom).toBeCloseTo(50, 1);
    expect(setup.margins.left).toBeCloseTo(setup.margins.right, 2);
  });
});

describe('page sizes and margins', () => {
  it('turns the page for landscape', () => {
    expect(pageDimensions({ paper: 'a4', orientation: 'portrait' })).toEqual({
      width: 210,
      height: 297,
    });
    expect(pageDimensions({ paper: 'a4', orientation: 'landscape' })).toEqual({
      width: 297,
      height: 210,
    });
    expect(pageDimensions({ paper: 'unknown', orientation: 'portrait' })).toEqual({
      width: 210,
      height: 297,
    });
  });

  it('recognizes the margin presets and custom margins', () => {
    for (const preset of MARGIN_PRESETS) expect(marginPresetOf(preset.margins)).toBe(preset.id);
    expect(marginPresetOf({ top: 25.4, right: 25.4, bottom: 25.4, left: 30 })).toBeNull();
  });

  it('leaves margins that fit unchanged', () => {
    const margins = { top: 10, right: 20, bottom: 30, left: 40 };
    expect(fitMargins(margins, { paper: 'a4', orientation: 'portrait' })).toEqual(margins);
  });

  it('converts between millimeters and the paper units', () => {
    expect(mmToUnits(25.4, 'in')).toBe(1);
    expect(mmToUnits(12.7, 'cm')).toBe(1.27);
    expect(unitsToMm(0.75, 'in')).toBe(19.05);
    expect(unitsToMm(2.5, 'cm')).toBe(25);
  });

  it('names the layout', () => {
    expect(pageSetupLabel(DEFAULT_PAGE_SETUP)).toBe('Pageless');
    expect(pageSetupLabel(a4Pages)).toBe('A4 · Landscape');
    expect(pageSetupLabel({ ...a4Pages, paper: 'letter', orientation: 'portrait' })).toBe(
      'Letter · Portrait',
    );
  });
});

describe('defaultPaperForLocale', () => {
  it('is Letter in the US and Canada and A4 elsewhere', () => {
    expect(defaultPaperForLocale('en-US')).toBe('letter');
    expect(defaultPaperForLocale('en')).toBe('letter');
    expect(defaultPaperForLocale('fr-CA')).toBe('letter');
    expect(defaultPaperForLocale('en-GB')).toBe('a4');
    expect(defaultPaperForLocale('de')).toBe('a4');
    expect(defaultPaperForLocale('hi-IN')).toBe('a4');
    expect(defaultPaperForLocale('not a locale!')).toBe('a4');
  });
});

describe('pageRuleCss', () => {
  it('writes the paper size in millimeters, never the landscape keyword', () => {
    const css = pageRuleCss(a4Pages);
    expect(css).toBe('@page { size: 297mm 210mm; margin: 20mm 15mm 20mm 15mm; }');
    expect(css).not.toMatch(/landscape|portrait|\bA4\b/i);
  });

  it('writes nothing for Pageless documents', () => {
    expect(pageRuleCss(DEFAULT_PAGE_SETUP)).toBe('');
  });
});

describe('pageLayoutStyle', () => {
  it('gives the canvas the turned page size and the margins in millimeters', () => {
    expect(pageLayoutStyle(a4Pages)).toMatchObject({
      '--ink-page-width': '297mm',
      '--ink-page-height': '210mm',
      '--ink-page-margin-top': '20mm',
      '--ink-page-margin-right': '15mm',
      '--ink-page-margin-bottom': '20mm',
      '--ink-page-margin-left': '15mm',
    });
  });

  it('gives Pageless side margins as shares of the canvas, split by their sizes', () => {
    const style = pageLayoutStyle({
      ...DEFAULT_PAGE_SETUP,
      sideMargins: { left: 0.3, right: 0.1 },
    });
    expect(style['--ink-side-margin-left']).toBe('0.3');
    expect(style['--ink-side-margin-right']).toBe('0.1');
    expect(Number(style['--ink-side-share-left'])).toBeCloseTo(0.75);
    expect(Number(style['--ink-side-share-right'])).toBeCloseTo(0.25);
  });

  it('splits evenly when there are no side margins', () => {
    const style = pageLayoutStyle({ ...DEFAULT_PAGE_SETUP, sideMargins: { left: 0, right: 0 } });
    expect(style['--ink-side-share-left']).toBe('0.5');
    expect(style['--ink-side-share-right']).toBe('0.5');
  });
});

describe('page colors', () => {
  // WCAG 2.1 relative luminance and contrast ratio.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // The editor's text, muted text and link colors (projects/.../_variables.scss, src/styles/tokens.scss).
  const LIGHT_TEXT = ['#0d0d0d', '#1b1b1f', '#6b6b73', '#017a78'];
  const DARK_TEXT = ['#f0efec', '#c3c2b7', '#9a9891', '#58aaa6'];

  it('keep WCAG AA contrast (4.5:1) for text, muted text and links in both themes', () => {
    for (const color of PAGE_COLORS) {
      for (const text of LIGHT_TEXT)
        expect(contrast(text, color.light)).toBeGreaterThanOrEqual(4.5);
      for (const text of DARK_TEXT) expect(contrast(text, color.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('are found by name; anything else is no color', () => {
    expect(findPageColor('sage')?.label).toBe('Sage');
    expect(findPageColor(null)).toBeNull();
    expect(findPageColor('neon')).toBeNull();
  });

  it('give the canvas their light and dark values; no color gives none', () => {
    const style = pageLayoutStyle({ ...DEFAULT_PAGE_SETUP, color: 'cream' });
    expect(style['--ink-page-color-light']).toBe(findPageColor('cream')!.light);
    expect(style['--ink-page-color-dark']).toBe(findPageColor('cream')!.dark);
    expect(pageLayoutStyle(DEFAULT_PAGE_SETUP)).not.toHaveProperty('--ink-page-color-light');
    expect(pageLayoutStyle({ ...DEFAULT_PAGE_SETUP, color: 'neon' })).not.toHaveProperty(
      '--ink-page-color-dark',
    );
  });
});

describe('zoom', () => {
  const A4 = 210 * (96 / 25.4); // 793.7px

  it('auto shows 100%, or fits a sheet wider than the canvas', () => {
    expect(resolveZoom('auto', A4, 1200)).toBe(1);
    expect(resolveZoom('auto', A4, 600)).toBeCloseTo(600 / A4, 3);
    // Before the canvas is measured, nothing is fitted.
    expect(resolveZoom('auto', A4, 0)).toBe(1);
  });

  it('fit fills the canvas width, up to 200%', () => {
    expect(resolveZoom('fit', A4, 1200)).toBeCloseTo(1200 / A4, 3);
    expect(resolveZoom('fit', A4, 5000)).toBe(2);
  });

  it('keeps a chosen level, within 25–200%', () => {
    expect(resolveZoom(1.5, A4, 600)).toBe(1.5);
    expect(resolveZoom(0.1, A4, 600)).toBe(0.25);
  });

  it('reads a stored zoom, and anything else as auto', () => {
    expect(normalizeZoom('fit')).toBe('fit');
    expect(normalizeZoom(0.75)).toBe(0.75);
    for (const raw of [null, 'big', Number.NaN, 0, 9, '1.5'])
      expect(normalizeZoom(raw)).toBe('auto');
  });
});
