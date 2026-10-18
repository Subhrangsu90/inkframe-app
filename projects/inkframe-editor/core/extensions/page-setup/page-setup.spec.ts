import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  MARGIN_PRESETS,
  PageSetup,
  defaultPaperForLocale,
  fitMargins,
  marginPresetOf,
  mmToUnits,
  normalizePageSetup,
  pageDimensions,
  pageLayoutStyle,
  pageRuleCss,
  pageSetupLabel,
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
