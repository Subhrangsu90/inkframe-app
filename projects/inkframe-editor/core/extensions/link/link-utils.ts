const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

/** Returns a safe href or null. Allow-list only. */
export function sanitizeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (href.startsWith('/') || href.startsWith('#')) return href;
  return SAFE_PROTOCOL.test(href) ? href : null;
}

/** Focuses the URL field once the link popover has rendered in the overlay. */
export function focusLinkInput(): void {
  if (typeof document === 'undefined') return;
  setTimeout(() =>
    document.querySelector<HTMLInputElement>('.cdk-overlay-container .ink-link-url-input')?.focus(),
  );
}
