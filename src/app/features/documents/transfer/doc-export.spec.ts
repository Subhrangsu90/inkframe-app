import '@angular/compiler';
import { describe, it, expect, afterEach } from 'vitest';
import { absoluteCssUrls, editorFontFaceCss } from './doc-export';

describe('editorFontFaceCss', () => {
  let style: HTMLStyleElement | undefined;
  afterEach(() => style?.remove());

  it("copies the editor fonts' @font-face rules and no others", () => {
    style = document.createElement('style');
    style.textContent = `
      @font-face { font-family: 'Inter Variable'; src: url(media/inter-latin.woff2) format('woff2'); }
      @font-face { font-family: 'JetBrains Mono Variable'; src: url(media/mono.woff2) format('woff2'); }
      @font-face { font-family: 'Material Symbols'; src: url(media/icons.woff2) format('woff2'); }
    `;
    document.head.appendChild(style);

    const css = editorFontFaceCss();
    expect(css).toContain('Inter Variable');
    expect(css).toContain('JetBrains Mono Variable');
    expect(css).not.toContain('Material Symbols');
  });
});

describe('absoluteCssUrls', () => {
  it('resolves font URLs against the stylesheet, so the print frame finds them', () => {
    const base = 'https://inkframe.app/styles-ABC.css';
    const css = `src: url(media/inter.woff2) format('woff2'), url("/media/a.woff") , url('b.ttf')`;
    expect(absoluteCssUrls(css, base)).toBe(
      `src: url("https://inkframe.app/media/inter.woff2") format('woff2'), ` +
        `url("https://inkframe.app/media/a.woff") , url("https://inkframe.app/b.ttf")`,
    );
  });

  it('leaves absolute and data URLs as they are', () => {
    const base = 'https://inkframe.app/';
    expect(absoluteCssUrls('url(https://cdn.example/x.woff2)', base)).toBe(
      'url("https://cdn.example/x.woff2")',
    );
    expect(absoluteCssUrls('url(data:font/woff2;base64,AAAA)', base)).toBe(
      'url("data:font/woff2;base64,AAAA")',
    );
  });
});
