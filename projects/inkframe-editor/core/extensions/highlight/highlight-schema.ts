import { MarkSpec } from 'prosemirror-model';
import { sanitizeCssColor } from '../../schema/sanitize-css';

/** The highlight color used when none is chosen (also for `<mark>` and `==text==` without a color). */
export const DEFAULT_HIGHLIGHT_COLOR = '#fef08a';

const NO_HIGHLIGHT = /^(transparent|none|inherit|initial|unset|revert|currentcolor|window)$/i;
// rgba(0, 0, 0, 0), hsla(0 0% 0% / 0%), ...: fully transparent.
const ZERO_ALPHA = /^(?:rgb|hsl)a?\((?:[^,]+,){3}\s*0*(?:\.0+)?%?\s*\)$|\/\s*0*(?:\.0+)?%?\s*\)$/i;

/** A CSS color usable as a highlight, or null for unsafe values and keywords that mean "no background". */
export function sanitizeHighlightColor(raw: unknown): string | null {
  const color = sanitizeCssColor(raw);
  return color && !NO_HIGHLIGHT.test(color) && !ZERO_ALPHA.test(color) ? color : null;
}

export const highlight: MarkSpec = {
  attrs: { color: { default: DEFAULT_HIGHLIGHT_COLOR } },
  parseDOM: [
    {
      tag: 'mark',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const color =
          sanitizeHighlightColor(el.getAttribute('data-color')) ??
          sanitizeHighlightColor(el.style.backgroundColor);
        return color ? { color } : {};
      },
    },
    {
      // A tag rule rather than a `background-color` style rule, which would
      // also turn table cell backgrounds into highlights on the cell's text.
      tag: 'span',
      consuming: false,
      getAttrs: (dom) => {
        const color = sanitizeHighlightColor((dom as HTMLElement).style.backgroundColor);
        return color ? { color } : false;
      },
    },
  ],
  toDOM: (mark) => {
    const color = sanitizeHighlightColor(mark.attrs['color']) ?? DEFAULT_HIGHLIGHT_COLOR;
    return ['mark', { 'data-color': color, style: `background-color: ${color}` }, 0];
  },
};
