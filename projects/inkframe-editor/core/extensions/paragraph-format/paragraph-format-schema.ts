import { Node as PMNode } from 'prosemirror-model';
import { readTextAlign, sanitizeTextAlign } from '../text-align/text-align-schema';

/*
 * Paragraph formatting: alignment, indent and line spacing, stored as
 * attributes of paragraphs and headings. The node specs always have them,
 * so documents load with or without the extensions that set them.
 */

/** Paragraphs and headings indent at most this many levels. */
export const MAX_INDENT = 8;

/** One indent level, in rem: as deep as one level of list nesting. */
export const INDENT_STEP_REM = 1.5;

/** A number from an attribute value (which may be a string from the DOM). */
const numberOf = (raw: unknown) =>
  typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;

/** The indent level if it is one the schema stores (1 to MAX_INDENT), otherwise null (none). */
export function sanitizeIndent(raw: unknown): number | null {
  const level = numberOf(raw);
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= MAX_INDENT
    ? level
    : null;
}

/** Line spacing as word processors name it: 1 is single spacing. */
export type LineSpacing = 1 | 1.15 | 1.5 | 2;

export interface LineSpacingOption {
  value: LineSpacing;
  label: string;
  /** The CSS line height it sets. */
  lineHeight: number;
}

/**
 * The line spacings offered. Single spacing is a line height of 1.2 times
 * the font size, as in Google Docs. Paragraphs without one keep the
 * document's default line height (1.65), between 1.15 and 1.5.
 */
export const LINE_SPACINGS: readonly LineSpacingOption[] = [
  { value: 1, label: 'Single', lineHeight: 1.2 },
  { value: 1.15, label: '1.15', lineHeight: 1.38 },
  { value: 1.5, label: '1.5', lineHeight: 1.8 },
  { value: 2, label: 'Double', lineHeight: 2.4 },
];

/** The line spacing if it is one of LINE_SPACINGS, otherwise null (the default). */
export function sanitizeLineSpacing(raw: unknown): LineSpacing | null {
  const value = numberOf(raw);
  return LINE_SPACINGS.find((o) => o.value === value)?.value ?? null;
}

/** The CSS line height of a line spacing. */
export function lineHeightOf(spacing: LineSpacing): number {
  return LINE_SPACINGS.find((o) => o.value === spacing)!.lineHeight;
}

/** The line spacing a CSS line height stands for, or null when it is none of them. */
export function lineSpacingForHeight(lineHeight: string): LineSpacing | null {
  const value = Number(lineHeight.trim());
  return LINE_SPACINGS.find((o) => o.lineHeight === value)?.value ?? null;
}

/** The attributes paragraphs and headings share. */
export const BLOCK_FORMAT_ATTRS = ['align', 'indent', 'lineSpacing'] as const;

export type BlockFormatAttr = (typeof BLOCK_FORMAT_ATTRS)[number];

/** Their specs, for a node spec's `attrs`. */
export const blockFormatAttrSpecs = () => ({
  align: { default: null },
  indent: { default: null },
  lineSpacing: { default: null },
});

/** A block's paragraph formatting, checked: only the attributes it has, with valid values. */
export function blockFormatOf(node: PMNode): Partial<Record<BlockFormatAttr, unknown>> {
  const format: Partial<Record<BlockFormatAttr, unknown>> = {};
  const align = sanitizeTextAlign(node.attrs['align']);
  const indent = sanitizeIndent(node.attrs['indent']);
  const lineSpacing = sanitizeLineSpacing(node.attrs['lineSpacing']);
  if (align) format.align = align;
  if (indent) format.indent = indent;
  if (lineSpacing) format.lineSpacing = lineSpacing;
  return format;
}

/** Reads a paragraph's or heading's formatting from the DOM. */
export function readBlockFormat(dom: HTMLElement): Record<BlockFormatAttr, unknown> {
  return {
    align: readTextAlign(dom),
    indent: sanitizeIndent(dom.getAttribute('data-indent')),
    lineSpacing: sanitizeLineSpacing(dom.getAttribute('data-line-spacing')),
  };
}

/** The CSS of a block's formatting, for example `text-align: center; margin-left: 3rem`. */
export function blockFormatCss(attrs: Record<string, unknown>): string {
  const styles: string[] = [];
  const align = sanitizeTextAlign(attrs['align']);
  const indent = sanitizeIndent(attrs['indent']);
  const lineSpacing = sanitizeLineSpacing(attrs['lineSpacing']);
  if (align) styles.push(`text-align: ${align}`);
  if (indent) styles.push(`margin-left: ${indent * INDENT_STEP_REM}rem`);
  if (lineSpacing) styles.push(`line-height: ${lineHeightOf(lineSpacing)}`);
  return styles.join('; ');
}

/**
 * The DOM attributes of a paragraph's or heading's formatting. Values are
 * checked against the allow-lists: shared documents can carry any attribute
 * value. The data attributes are what parsing reads back; the style is what
 * every other reader of the HTML sees.
 */
export function blockFormatDomAttrs(attrs: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const indent = sanitizeIndent(attrs['indent']);
  const lineSpacing = sanitizeLineSpacing(attrs['lineSpacing']);
  if (indent) out['data-indent'] = String(indent);
  if (lineSpacing) out['data-line-spacing'] = String(lineSpacing);
  const style = blockFormatCss(attrs);
  if (style) out['style'] = style;
  return out;
}
