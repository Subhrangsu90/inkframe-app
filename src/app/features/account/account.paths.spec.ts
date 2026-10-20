import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN, returnToParams, safeReturnTo } from './account.paths';

describe('safeReturnTo', () => {
  it('keeps paths inside the app, query and fragment included', () => {
    expect(safeReturnTo('/doc/doc_1')).toBe('/doc/doc_1');
    expect(safeReturnTo('/docs?q=plan#top')).toBe('/docs?q=plan#top');
    expect(safeReturnTo('/settings')).toBe('/settings');
  });

  it('never sends people to another site', () => {
    for (const value of [
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'docs',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(safeReturnTo(value), String(value)).toBe(DEFAULT_RETURN);
    }
  });

  it('never goes back to the sign-in pages themselves', () => {
    expect(safeReturnTo('/signin')).toBe(DEFAULT_RETURN);
    expect(safeReturnTo('/signup?returnTo=/docs')).toBe(DEFAULT_RETURN);
    expect(safeReturnTo('/signing-tips')).toBe('/signing-tips');
  });
});

describe('returnToParams', () => {
  it('leaves the default out of links', () => {
    expect(returnToParams('/docs')).toEqual({});
    expect(returnToParams('/settings')).toEqual({ returnTo: '/settings' });
    expect(returnToParams('https://evil.example')).toEqual({});
  });
});
