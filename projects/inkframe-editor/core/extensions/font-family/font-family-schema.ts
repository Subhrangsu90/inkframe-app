import { MarkSpec } from 'prosemirror-model';
import { DOCUMENT_FONTS } from '../page-setup/page-setup';

/** A font chosen for some text, stored by name: one of FONT_FAMILIES. */
export type FontFamily =
  | 'sans'
  | 'serif'
  | 'mono'
  | 'arial'
  | 'comic-sans'
  | 'courier-new'
  | 'georgia'
  | 'impact'
  | 'palatino'
  | 'times-new-roman'
  | 'trebuchet'
  | 'verdana';

export interface FontFamilyOption {
  value: FontFamily;
  label: string;
  /** The CSS font stack, with similar fonts after it for systems without the font. */
  stack: string;
}

/**
 * The fonts offered for selected text: the document fonts, which the app
 * serves itself (DOCUMENT_FONTS), then fonts most computers have. Text
 * without a font has the document's font (the page setup's). Fonts are
 * stored by name, never as CSS, so a shared document cannot set any other
 * `font-family`.
 */
export const FONT_FAMILIES: readonly FontFamilyOption[] = [
  ...DOCUMENT_FONTS.map(({ value, label, stack }) => ({ value, label, stack })),
  { value: 'arial', label: 'Arial', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  {
    value: 'comic-sans',
    label: 'Comic Sans MS',
    stack: "'Comic Sans MS', 'Comic Sans', 'Chalkboard SE', cursive",
  },
  { value: 'courier-new', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { value: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  {
    value: 'impact',
    label: 'Impact',
    stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  },
  {
    value: 'palatino',
    label: 'Palatino',
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  },
  { value: 'times-new-roman', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  {
    value: 'trebuchet',
    label: 'Trebuchet MS',
    stack: "'Trebuchet MS', 'Lucida Grande', sans-serif",
  },
  { value: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
];

/** The option for a font, or undefined when it is none of FONT_FAMILIES. */
export function findFontFamily(raw: unknown): FontFamilyOption | undefined {
  return FONT_FAMILIES.find((f) => f.value === raw);
}

/** The font if it is one of FONT_FAMILIES, otherwise null. */
export function sanitizeFontFamily(raw: unknown): FontFamily | null {
  return findFontFamily(raw)?.value ?? null;
}

/** The font a CSS font stack stands for, or null when it is none of FONT_FAMILIES' stacks. */
export function fontFamilyForStack(stack: string): FontFamily | null {
  const value = stack.trim();
  return FONT_FAMILIES.find((f) => f.stack === value)?.value ?? null;
}

/**
 * A font chosen for some text. Only spans with `data-font-family` are read:
 * Inkframe's own HTML. Fonts in pasted web pages, Word and Google Docs are
 * the source's styling (every span of a Google Docs paste names its font),
 * so they are left out, as font sizes are.
 */
export const fontFamily: MarkSpec = {
  attrs: { font: { default: 'sans' } },
  parseDOM: [
    {
      tag: 'span[data-font-family]',
      consuming: false,
      getAttrs: (dom) => {
        const font = sanitizeFontFamily((dom as HTMLElement).getAttribute('data-font-family'));
        return font ? { font } : false;
      },
    },
  ],
  toDOM: (mark) => {
    const font = findFontFamily(mark.attrs['font']);
    return [
      'span',
      font ? { 'data-font-family': font.value, style: `font-family: ${font.stack}` } : {},
      0,
    ];
  },
};
