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

export const MARGIN_PRESETS: readonly MarginPreset[] = [
  { id: 'narrow', label: 'Narrow', margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { id: 'normal', label: 'Normal', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  { id: 'wide', label: 'Wide', margins: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 } },
];

/** Margins always leave at least this much text width and height, in millimeters. */
export const MIN_TEXT_AREA_MM = 50;

const MAX_SIDE_MARGIN = 0.4;

export const DEFAULT_PAGE_SETUP: PageSetup = {
  layout: 'pageless',
  paper: 'a4',
  orientation: 'portrait',
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  sideMargins: { left: 0.1, right: 0.1 },
  color: null,
  printColor: false,
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
    a.printColor === b.printColor
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

/**
 * The custom properties that lay out a document on screen, for the element
 * with the `ink-canvas` class (with `data-ink-layout` set to the layout; see
 * the editor's page layout styles): the paper size and margins for Pages,
 * the side margins for Pageless.
 */
export function pageLayoutStyle(setup: PageSetup): Record<string, string> {
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;
  const sides = setup.sideMargins;
  const total = sides.left + sides.right;
  return {
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
