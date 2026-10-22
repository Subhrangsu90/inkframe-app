/** Paragraph and heading alignment. `left` is stored as `null` (the default). */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export const TEXT_ALIGNMENTS: TextAlign[] = ['left', 'center', 'right', 'justify'];

/** Returns the alignment if it is one the schema stores (center, right, justify), otherwise null. */
export function sanitizeTextAlign(raw: unknown): Exclude<TextAlign, 'left'> | null {
  return raw === 'center' || raw === 'right' || raw === 'justify' ? raw : null;
}

export function readTextAlign(dom: HTMLElement): Exclude<TextAlign, 'left'> | null {
  // The raw attribute too: not every CSS engine accepts `-webkit-center`.
  const raw = /text-align\s*:\s*([-\w]+)/i.exec(dom.getAttribute('style') ?? '')?.[1];
  const value = (dom.style.textAlign || raw || dom.getAttribute('align') || '')
    .trim()
    .toLowerCase();
  return sanitizeTextAlign(value === '-webkit-center' ? 'center' : value);
}
