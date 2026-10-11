const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

/** Returns a safe href or null. Allow-list only. */
export function sanitizeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (href.startsWith('/') || href.startsWith('#')) return href;
  return SAFE_PROTOCOL.test(href) ? href : null;
}

const CSS_COLOR = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\(\s*[\d.%+\-\s,/]+\)|[a-z]{3,30})$/i;
const CSS_LENGTH = /^\d+(?:\.\d+)?(?:px|%|em|rem|vw)?$/i;

/**
 * Returns the value if it is a plain CSS color (hex, rgb[a](), hsl[a]() or a
 * named color), otherwise null. Used before interpolating document attributes
 * into `style`, so shared documents cannot inject extra CSS declarations
 * (e.g. `red; background:url(https://tracker)`).
 */
export function sanitizeCssColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return CSS_COLOR.test(value) ? value : null;
}

/** Returns the value if it is a plain CSS length (e.g. `320px`, `50%`), otherwise null. */
export function sanitizeCssLength(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  return CSS_LENGTH.test(value) ? value : null;
}
