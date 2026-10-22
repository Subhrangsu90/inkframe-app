import { Node as PMNode } from 'prosemirror-model';

/**
 * Page setup: how a document is laid out and printed. It is stored in the
 * document, as the `page` attribute of the `doc` node, so share links,
 * backups and version history carry it. Documents without one (everything
 * saved before page setup existed) are Pageless with the default margins.
 *
 * Values come from share links too, so they are only ever read through
 * normalizePageSetup(), which checks every field and falls back to defaults.
 */

/** `pages`: a sheet at the paper's size. `pageless`: the full canvas. */
export type PageLayout = 'pages' | 'pageless';
export type PageOrientation = 'portrait' | 'landscape';

/** Page margins in millimeters (Pages layout). */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Side margins as a share of the canvas width, 0 to 0.4 (Pageless layout). */
export interface SideMargins {
  left: number;
  right: number;
}

export type MarginTextAlign = 'left' | 'center' | 'right';

/** A line of plain text in each page's top or bottom margin (Pages layout). */
export interface MarginText {
  /** One line, at most MAX_MARGIN_TEXT characters; empty for none. */
  text: string;
  align: MarginTextAlign;
}

/** Page numbers in each page's top or bottom margin (Pages layout). */
export interface PageNumbers {
  position: 'none' | 'top' | 'bottom';
  align: MarginTextAlign;
  /** `number`: "3". `page-of`: "Page 3 of 12". */
  format: 'number' | 'page-of';
}

export interface PageSetup {
  layout: PageLayout;
  /** An id from PAPER_SIZES. */
  paper: string;
  orientation: PageOrientation;
  margins: PageMargins;
  sideMargins: SideMargins;
  /** The name of a page color, never a CSS value; null for none. */
  color: string | null;
  /** Whether the page color is printed. */
  printColor: boolean;
  /** Text in each page's top margin. */
  header: MarginText;
  /** Text in each page's bottom margin. */
  footer: MarginText;
  pageNumbers: PageNumbers;
  /** Whether the header, footer and number show on the first page too (false for a title page). */
  firstPage: boolean;
  /** The document's font: its text, headers and footers, on screen and in print. */
  font: DocumentFont;
}

/** A document's font: the whole document, not chosen per character. */
export type DocumentFont = 'sans' | 'serif' | 'mono';

export interface DocumentFontOption {
  value: DocumentFont;
  label: string;
  /** The font family the app serves (`@font-face`). */
  family: string;
  /** The CSS font stack, with system fonts after it for pages without the font files. */
  stack: string;
}

/**
 * The document fonts: Inter, Source Serif 4 and JetBrains Mono, which the
 * app serves itself. On screen, Sans is the page's own font, so a host app's
 * body font stays the document's font until someone picks another.
 */
export const DOCUMENT_FONTS: readonly DocumentFontOption[] = [
  {
    value: 'sans',
    label: 'Sans',
    family: 'Inter Variable',
    stack:
      "'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  {
    value: 'serif',
    label: 'Serif',
    family: 'Source Serif 4 Variable',
    stack:
      "'Source Serif 4 Variable', 'Source Serif 4', 'Source Serif Pro', Georgia, Cambria, 'Times New Roman', serif",
  },
  {
    value: 'mono',
    label: 'Mono',
    family: 'JetBrains Mono Variable',
    stack:
      "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
];

/** The option for a document font (Sans for an unknown one). */
export function findDocumentFont(font: DocumentFont): DocumentFontOption {
  return DOCUMENT_FONTS.find((f) => f.value === font) ?? DOCUMENT_FONTS[0];
}

export interface PaperSize {
  id: string;
  label: string;
  /** Portrait width and height in millimeters. */
  width: number;
  height: number;
  /** The units its margins are shown in. */
  units: 'cm' | 'in';
}

export const PAPER_SIZES: readonly PaperSize[] = [
  { id: 'a4', label: 'A4', width: 210, height: 297, units: 'cm' },
  { id: 'letter', label: 'Letter', width: 215.9, height: 279.4, units: 'in' },
  { id: 'legal', label: 'Legal', width: 215.9, height: 355.6, units: 'in' },
  { id: 'a3', label: 'A3', width: 297, height: 420, units: 'cm' },
  { id: 'a5', label: 'A5', width: 148, height: 210, units: 'cm' },
];

export interface MarginPreset {
  id: 'narrow' | 'normal' | 'wide';
  label: string;
  margins: PageMargins;
}

export interface PageColor {
  /** What documents store (`PageSetup.color`). */
  name: string;
  label: string;
  /** The page in the light theme, and in print and exports. */
  light: string;
  /** The page in the dark theme. */
  dark: string;
}

/**
 * Page colors. Each keeps WCAG AA contrast (4.5:1) for the editor's text,
 * muted text and links in both themes (see page-setup.spec.ts).
 */
export const PAGE_COLORS: readonly PageColor[] = [
  { name: 'cream', label: 'Cream', light: '#fbf6e8', dark: '#262219' },
  { name: 'sage', label: 'Sage', light: '#edf4ec', dark: '#1b241e' },
  { name: 'sky', label: 'Sky', light: '#ebf3fb', dark: '#19212b' },
  { name: 'lavender', label: 'Lavender', light: '#f2effa', dark: '#221e2b' },
  { name: 'rose', label: 'Rose', light: '#fbeef0', dark: '#2b1f23' },
  { name: 'gray', label: 'Gray', light: '#f1f1ef', dark: '#2a2a28' },
];

/** The page color with this name; null for none or an unknown name. */
export function findPageColor(name: string | null): PageColor | null {
  return PAGE_COLORS.find((c) => c.name === name) ?? null;
}

export const MARGIN_PRESETS: readonly MarginPreset[] = [
  { id: 'narrow', label: 'Narrow', margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { id: 'normal', label: 'Normal', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  { id: 'wide', label: 'Wide', margins: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 } },
];

/** Margins always leave at least this much text width and height, in millimeters. */
export const MIN_TEXT_AREA_MM = 50;

/** The largest Pageless side margin, as a share of the canvas width. */
export const MAX_SIDE_MARGIN = 0.4;

/**
 * Pageless limits on screen, in CSS pixels (as in the page layout styles):
 * side margins are at least PAGELESS_MIN_MARGIN_PX, and together leave at
 * least PAGELESS_MIN_TEXT_PX of text.
 */
export const PAGELESS_MIN_MARGIN_PX = 32;
export const PAGELESS_MIN_TEXT_PX = 320;

/** CSS pixels per millimeter (96 per inch). */
export const PX_PER_MM = 96 / 25.4;

/** The longest header or footer text, in characters. */
export const MAX_MARGIN_TEXT = 200;

/** Margins under this many millimeters put a header or footer near the paper's edge, where some printers cannot print. */
export const MIN_MARGIN_TEXT_MARGIN_MM = 15;

export const DEFAULT_PAGE_SETUP: PageSetup = {
  layout: 'pageless',
  paper: 'a4',
  orientation: 'portrait',
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  sideMargins: { left: 0.1, right: 0.1 },
  color: null,
  printColor: false,
  header: { text: '', align: 'left' },
  footer: { text: '', align: 'left' },
  pageNumbers: { position: 'none', align: 'right', format: 'number' },
  firstPage: true,
  font: 'sans',
};

/** Regions that use US paper sizes; everywhere else uses A4. */
const LETTER_REGIONS = new Set(['US', 'CA']);

/**
 * The paper for a locale: Letter in the US and Canada, A4 elsewhere. A
 * language without a region counts as its most likely region (`en` is US).
 */
export function defaultPaperForLocale(locale?: string): string {
  const tag = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
  if (!tag) return 'a4';
  try {
    const region = new Intl.Locale(tag).maximize().region;
    return region && LETTER_REGIONS.has(region) ? 'letter' : 'a4';
  } catch {
    return 'a4';
  }
}

/** The page setup a document starts with when nobody chose one, for this locale. */
export function initialPageSetup(locale?: string): PageSetup {
  return { ...DEFAULT_PAGE_SETUP, paper: defaultPaperForLocale(locale) };
}

/** The paper size with this id, or A4 when the id is unknown. */
export function findPaperSize(id: string): PaperSize {
  return PAPER_SIZES.find((p) => p.id === id) ?? PAPER_SIZES[0];
}

/** The page's width and height in millimeters, turned for landscape. */
export function pageDimensions(setup: Pick<PageSetup, 'paper' | 'orientation'>): {
  width: number;
  height: number;
} {
  const { width, height } = findPaperSize(setup.paper);
  return setup.orientation === 'landscape' ? { width: height, height: width } : { width, height };
}

/** The preset whose margins these are, or null for custom margins. */
export function marginPresetOf(margins: PageMargins): MarginPreset['id'] | null {
  const preset = MARGIN_PRESETS.find((p) =>
    (['top', 'right', 'bottom', 'left'] as const).every(
      (side) => Math.abs(p.margins[side] - margins[side]) < 0.01,
    ),
  );
  return preset?.id ?? null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Rounds to `digits` decimal places (dividing, so 25.4 stays 25.4). */
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A finite number in [min, max], or the fallback. */
function numberIn(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(max, Math.max(min, raw))
    : fallback;
}

/**
 * Scales two opposite margins down so they leave at least MIN_TEXT_AREA_MM
 * of a page side.
 */
function fitPair(a: number, b: number, side: number): [number, number] {
  const room = Math.max(0, side - MIN_TEXT_AREA_MM);
  const total = a + b;
  if (total <= room) return [a, b];
  const scale = room / total;
  return [round(a * scale, 2), round(b * scale, 2)];
}

/** Margins that fit the page: no negative values, at least 50 mm of text each way. */
export function fitMargins(
  margins: PageMargins,
  setup: Pick<PageSetup, 'paper' | 'orientation'>,
): PageMargins {
  const { width, height } = pageDimensions(setup);
  const [left, right] = fitPair(Math.max(0, margins.left), Math.max(0, margins.right), width);
  const [top, bottom] = fitPair(Math.max(0, margins.top), Math.max(0, margins.bottom), height);
  return { top, right, bottom, left };
}

const COLOR_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** A character class from code point ranges (as numbers, so the source holds no such characters). */
const charRanges = (ranges: [number, number][]) =>
  ranges.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('');

// Control characters, line and paragraph separators, and bidirectional
// overrides (which could make a shared document's header read differently).
const NOT_ONE_LINE = new RegExp(
  `[${charRanges([
    [0x00, 0x1f],
    [0x7f, 0x9f],
    [0x2028, 0x2029],
    [0x202a, 0x202e],
    [0x2066, 0x2069],
  ])}]`,
  'g',
);

/** One line of plain text, at most MAX_MARGIN_TEXT characters. */
function oneLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.replace(NOT_ONE_LINE, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, MAX_MARGIN_TEXT).join('').trim();
}

const ALIGNS: readonly MarginTextAlign[] = ['left', 'center', 'right'];

function oneOf<T extends string>(raw: unknown, values: readonly T[], fallback: T): T {
  return values.includes(raw as T) ? (raw as T) : fallback;
}

function marginTextOf(raw: unknown, fallback: MarginText): MarginText {
  const r = isRecord(raw) ? raw : {};
  return { text: oneLine(r['text']), align: oneOf(r['align'], ALIGNS, fallback.align) };
}

function pageNumbersOf(raw: unknown): PageNumbers {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_PAGE_SETUP.pageNumbers;
  return {
    position: oneOf(r['position'], ['none', 'top', 'bottom'] as const, d.position),
    align: oneOf(r['align'], ALIGNS, d.align),
    format: oneOf(r['format'], ['number', 'page-of'] as const, d.format),
  };
}

/**
 * Checks a stored page setup. Returns null when there is none (or it is not
 * an object at all); otherwise a complete, valid setup in which every field
 * that is missing or wrong has its default.
 */
export function normalizePageSetup(raw: unknown): PageSetup | null {
  if (!isRecord(raw)) return null;
  const d = DEFAULT_PAGE_SETUP;
  const layout: PageLayout = raw['layout'] === 'pages' ? 'pages' : 'pageless';
  const paper =
    typeof raw['paper'] === 'string' && PAPER_SIZES.some((p) => p.id === raw['paper'])
      ? raw['paper']
      : d.paper;
  const orientation: PageOrientation =
    raw['orientation'] === 'landscape' ? 'landscape' : 'portrait';

  const m = isRecord(raw['margins']) ? raw['margins'] : {};
  const margin = (side: keyof PageMargins) => round(numberIn(m[side], 0, 1000, d.margins[side]), 2);
  const margins = fitMargins(
    { top: margin('top'), right: margin('right'), bottom: margin('bottom'), left: margin('left') },
    { paper, orientation },
  );

  const s = isRecord(raw['sideMargins']) ? raw['sideMargins'] : {};
  const side = (key: keyof SideMargins) =>
    round(numberIn(s[key], 0, MAX_SIDE_MARGIN, d.sideMargins[key]), 3);

  const color =
    typeof raw['color'] === 'string' && COLOR_NAME.test(raw['color']) ? raw['color'] : null;

  return {
    layout,
    paper,
    orientation,
    margins,
    sideMargins: { left: side('left'), right: side('right') },
    color,
    printColor: raw['printColor'] === true,
    header: marginTextOf(raw['header'], d.header),
    footer: marginTextOf(raw['footer'], d.footer),
    pageNumbers: pageNumbersOf(raw['pageNumbers']),
    firstPage: raw['firstPage'] !== false,
    font: oneOf(raw['font'], ['sans', 'serif', 'mono'] as const, d.font),
  };
}

/** The document's page setup: the stored one, or the default. */
export function pageSetupOf(doc: PMNode): PageSetup {
  return normalizePageSetup(doc.attrs['page']) ?? DEFAULT_PAGE_SETUP;
}

/** The page setup the document stores, or null when it has none. */
export function storedPageSetupOf(doc: PMNode): PageSetup | null {
  return normalizePageSetup(doc.attrs['page']);
}

export function samePageSetup(a: PageSetup | null, b: PageSetup | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.layout === b.layout &&
    a.paper === b.paper &&
    a.orientation === b.orientation &&
    a.margins.top === b.margins.top &&
    a.margins.right === b.margins.right &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    a.sideMargins.left === b.sideMargins.left &&
    a.sideMargins.right === b.sideMargins.right &&
    a.color === b.color &&
    a.printColor === b.printColor &&
    a.header.text === b.header.text &&
    a.header.align === b.header.align &&
    a.footer.text === b.footer.text &&
    a.footer.align === b.footer.align &&
    a.pageNumbers.position === b.pageNumbers.position &&
    a.pageNumbers.align === b.pageNumbers.align &&
    a.pageNumbers.format === b.pageNumbers.format &&
    a.firstPage === b.firstPage &&
    a.font === b.font
  );
}

/** A page's number as shown: "3", or "Page 3 of 12". */
export function pageNumberText(format: PageNumbers['format'], page: number, pages: number): string {
  return format === 'page-of' ? `Page ${page} of ${pages}` : String(page);
}

/** What a page's top or bottom margin shows: text on the left, in the center and on the right. */
export interface MarginLine {
  left: string;
  center: string;
  right: string;
}

/**
 * The header and footer of page `page` (from 1) of `pages`, with the page
 * number where it goes; null for a margin with nothing to show. Text and a
 * number on the same side share it ("Draft · 3"). Pages layout only.
 */
export function pageMarginLines(
  setup: PageSetup,
  page: number,
  pages: number,
): { top: MarginLine | null; bottom: MarginLine | null } {
  if (setup.layout !== 'pages' || (page === 1 && !setup.firstPage)) {
    return { top: null, bottom: null };
  }
  const numbers = setup.pageNumbers;
  const line = (text: MarginText, withNumber: boolean): MarginLine | null => {
    const out: MarginLine = { left: '', center: '', right: '' };
    if (text.text) out[text.align] = text.text;
    if (withNumber) {
      const number = pageNumberText(numbers.format, page, pages);
      out[numbers.align] = out[numbers.align] ? `${out[numbers.align]} · ${number}` : number;
    }
    return out.left || out.center || out.right ? out : null;
  };
  return {
    top: line(setup.header, numbers.position === 'top'),
    bottom: line(setup.footer, numbers.position === 'bottom'),
  };
}

/** Whether a Pages document shows anything in its page margins: a header, footer or numbers. */
export function hasMarginText(setup: PageSetup): boolean {
  return (
    setup.layout === 'pages' &&
    (!!setup.header.text || !!setup.footer.text || setup.pageNumbers.position !== 'none')
  );
}

/** A short name for the layout, for example "Pageless" or "A4 · Portrait". */
export function pageSetupLabel(setup: PageSetup): string {
  if (setup.layout === 'pageless') return 'Pageless';
  const orientation = setup.orientation === 'landscape' ? 'Landscape' : 'Portrait';
  return `${findPaperSize(setup.paper).label} · ${orientation}`;
}

/** Millimeters in the paper's units (cm or in), rounded for display. */
export function mmToUnits(mm: number, units: PaperSize['units']): number {
  return units === 'in' ? Math.round((mm / 25.4) * 100) / 100 : Math.round(mm * 10) / 100;
}

/** A length in the paper's units (cm or in) as millimeters. */
export function unitsToMm(value: number, units: PaperSize['units']): number {
  return round(units === 'in' ? value * 25.4 : value * 10, 2);
}

const mm = (value: number) => `${+value.toFixed(2)}mm`;

/**
 * The `@page` rule for printing in Pages layout: the paper size and margins.
 * Sizes are always written in millimeters, never as `A4 landscape`, because
 * Safari supports `size` but not the orientation keywords. Pageless
 * documents print on the paper chosen in the print dialog, so they get none.
 */
export function pageRuleCss(setup: PageSetup): string {
  if (setup.layout !== 'pages') return '';
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;
  return `@page { size: ${mm(width)} ${mm(height)}; margin: ${mm(top)} ${mm(right)} ${mm(bottom)} ${mm(left)}; }`;
}

/** A CSS string literal of plain text. */
const cssString = (text: string) => `"${text.replace(/[\\"]/g, '\\$&')}"`;

/**
 * `@page` margin boxes with the header, footer and page numbers, for a
 * printout that flows onto pages by itself (without page view's page
 * starts). Only Chrome supports margin boxes; other browsers print without
 * them. `font` is the CSS `font` value for the text, such as
 * `11px Inter, sans-serif`.
 */
export function pageMarginBoxCss(setup: PageSetup, font: string): string {
  if (!hasMarginText(setup)) return '';
  const numbers = setup.pageNumbers;
  const number =
    numbers.format === 'page-of' ? '"Page " counter(page) " of " counter(pages)' : 'counter(page)';
  const edges = [
    ['top', setup.header, numbers.position === 'top'],
    ['bottom', setup.footer, numbers.position === 'bottom'],
  ] as const;
  const boxes: { name: string; content: string }[] = [];
  for (const [edge, text, withNumber] of edges) {
    for (const align of ALIGNS) {
      const parts: string[] = [];
      if (text.text && text.align === align) parts.push(cssString(text.text));
      if (withNumber && numbers.align === align) parts.push(number);
      if (parts.length) boxes.push({ name: `${edge}-${align}`, content: parts.join(' " · " ') });
    }
  }
  const style = `font: ${font}; color: #6b6b6b;`;
  const rule = (selector: string, content: (box: (typeof boxes)[number]) => string) =>
    `${selector} { ${boxes.map((box) => `@${box.name} { ${content(box)} }`).join(' ')} }`;
  let css = rule('@page', (box) => `content: ${box.content}; ${style}`);
  if (!setup.firstPage) css += '\n' + rule('@page :first', () => 'content: none;');
  return css;
}

/**
 * The custom properties that lay out a document on screen, for the element
 * with the `ink-canvas` class (with `data-ink-layout` set to the layout and
 * `data-ink-page-color` to the color's name; see the editor's page layout
 * styles): the paper size and margins for Pages, the side margins for
 * Pageless, the page color's light and dark values, and the font unless it
 * is Sans (the page's own). Host apps can change the fonts behind Serif and
 * Mono with `--ink-font-serif` and `--ink-font-mono`.
 */
export function pageLayoutStyle(setup: PageSetup): Record<string, string> {
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;
  const sides = setup.sideMargins;
  const total = sides.left + sides.right;
  const color = findPageColor(setup.color);
  const font = setup.font === 'sans' ? null : findDocumentFont(setup.font);
  return {
    ...(color
      ? { '--ink-page-color-light': color.light, '--ink-page-color-dark': color.dark }
      : {}),
    ...(font ? { '--ink-doc-font': `var(--ink-font-${font.value}, ${font.stack})` } : {}),
    '--ink-page-width': mm(width),
    '--ink-page-height': mm(height),
    '--ink-page-margin-top': mm(top),
    '--ink-page-margin-right': mm(right),
    '--ink-page-margin-bottom': mm(bottom),
    '--ink-page-margin-left': mm(left),
    '--ink-side-margin-left': String(sides.left),
    '--ink-side-margin-right': String(sides.right),
    // Each side's part of the room the margins may take, when the window is narrow.
    '--ink-side-share-left': String(total ? sides.left / total : 0.5),
    '--ink-side-share-right': String(total ? sides.right / total : 0.5),
  };
}

/**
 * How big a Pages sheet is shown: a view setting of the person, not part of
 * the document. `auto` shows the sheet at 100%, or fits it to the canvas when
 * it is wider; `fit` always fits it to the canvas width; a number is a scale.
 */
export type PageZoom = 'auto' | 'fit' | number;

/** The zoom levels offered, besides fitting the width. */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

/** A stored zoom, checked: anything else is `auto`. */
export function normalizeZoom(raw: unknown): PageZoom {
  if (raw === 'fit' || raw === 'auto') return raw;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= MIN_ZOOM && raw <= MAX_ZOOM
    ? raw
    : 'auto';
}

/**
 * The scale a zoom works out to, for a sheet `sheetPx` wide on a canvas with
 * `canvasPx` of room (0 while unknown: then the sheet is not fitted).
 */
export function resolveZoom(zoom: PageZoom, sheetPx: number, canvasPx: number): number {
  const fit = canvasPx > 0 && sheetPx > 0 ? canvasPx / sheetPx : 1;
  const scale = zoom === 'fit' ? fit : zoom === 'auto' ? Math.min(1, fit) : zoom;
  return round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale)), 3);
}
