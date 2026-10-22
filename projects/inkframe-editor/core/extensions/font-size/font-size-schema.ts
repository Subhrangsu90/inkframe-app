import { MarkSpec } from 'prosemirror-model';

/**
 * The font sizes offered, in CSS pixels. Text without a size is the
 * document's size (`--ink-editor-font-size`, 14px by default), and headings
 * are larger.
 */
export const FONT_SIZES: readonly number[] = [10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 120;

/** A font size in whole pixels, MIN_FONT_SIZE to MAX_FONT_SIZE, or null for anything else. */
export function sanitizeFontSize(raw: unknown): number | null {
  const size = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof size !== 'number' || !Number.isFinite(size)) return null;
  const rounded = Math.round(size);
  return rounded >= MIN_FONT_SIZE && rounded <= MAX_FONT_SIZE ? rounded : null;
}

/**
 * A font size chosen for some text. Only spans with `data-font-size` are
 * read: Inkframe's own HTML. Sizes in pasted web pages, Word and Google Docs
 * are the source's styling (every span of a Google Docs paste says 11pt),
 * so they are left out, as before this mark existed.
 */
export const fontSize: MarkSpec = {
  attrs: { size: { default: 14 } },
  parseDOM: [
    {
      tag: 'span[data-font-size]',
      consuming: false,
      getAttrs: (dom) => {
        const size = sanitizeFontSize((dom as HTMLElement).getAttribute('data-font-size'));
        return size ? { size } : false;
      },
    },
  ],
  toDOM: (mark) => {
    const size = sanitizeFontSize(mark.attrs['size']);
    return [
      'span',
      size ? { 'data-font-size': String(size), style: `font-size: ${size}px` } : {},
      0,
    ];
  },
};
