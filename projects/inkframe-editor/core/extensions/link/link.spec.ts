import { describe, it, expect } from 'vitest';
import { sanitizeHref } from './link-utils';

describe('Link Sanitization (Security)', () => {
  it('allows valid https, http, and mailto URLs', () => {
    expect(sanitizeHref('https://example.com')).toBe('https://example.com');
    expect(sanitizeHref('http://example.com/page?foo=bar')).toBe('http://example.com/page?foo=bar');
    expect(sanitizeHref('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('rejects javascript: and other dangerous protocols', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeHref('JAVASCRIPT:alert(document.cookie)')).toBeNull();
    expect(sanitizeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeHref('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeHref('')).toBeNull();
    expect(sanitizeHref(null)).toBeNull();
  });
});
