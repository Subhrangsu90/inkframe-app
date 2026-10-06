const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

/** Returns a safe href or null. Allow-list only. */
export function sanitizeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (href.startsWith('/') || href.startsWith('#')) return href;
  return SAFE_PROTOCOL.test(href) ? href : null;
}
