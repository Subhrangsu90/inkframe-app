import { describe, it, expect } from 'vitest';
import { schema } from '../schema/schema';
import { docToHtmlDocument, HTML_DOCUMENT_CSS } from './html-document';

const doc = schema.nodeFromJSON({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Report' }] },
    {
      type: 'code_block',
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const x = 1;' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
  ],
});

describe('docToHtmlDocument', () => {
  it('builds a complete page with an escaped title and the content', () => {
    const html = docToHtmlDocument(doc, { title: 'Q3 <draft> & "notes"' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Q3 &lt;draft&gt; &amp; &quot;notes&quot;</title>');
    expect(html).toContain('<h1>Report</h1>');
    // Code is highlighted, so it needs no script to look right.
    expect(html).toContain('class="token keyword"');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('javascript:');
  });

  it('falls back to a default title', () => {
    expect(docToHtmlDocument(doc)).toContain('<title>Untitled document</title>');
  });

  it('loads nothing from the network', () => {
    expect(HTML_DOCUMENT_CSS).not.toMatch(/@import|url\(\s*['"]?(https?:)?\/\//i);
  });

  it('prints Pages documents on their paper size and margins, at the editor font size', () => {
    const pages = schema.nodeFromJSON({
      ...doc.toJSON(),
      attrs: {
        page: {
          layout: 'pages',
          paper: 'letter',
          orientation: 'landscape',
          margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
        },
      },
    });
    const html = docToHtmlDocument(pages, {
      editorFontSize: '15px',
      editorLetterSpacing: '-0.165px',
    });
    expect(html).toContain('@page { size: 279.4mm 215.9mm; margin: 12.7mm 12.7mm 12.7mm 12.7mm; }');
    // After the default print rules, so it wins over them.
    expect(html.lastIndexOf('@page')).toBeGreaterThan(html.indexOf('margin: 18mm 16mm'));
    expect(html).toMatch(
      /@media print \{\s*@page[^}]+\}\s*body \{ font-size: 15px; letter-spacing: -0.165px; \}/,
    );
  });

  it('sets Pages text as the editor does, so lines break in the same places', () => {
    const pages = schema.nodeFromJSON({ ...doc.toJSON(), attrs: { page: { layout: 'pages' } } });
    const html = docToHtmlDocument(pages);
    const print = html.slice(html.lastIndexOf('@media print'));
    expect(print).toContain('font-variant-ligatures: none');
    expect(print).toContain("font-feature-settings: 'liga' 0");
    expect(print).toContain('white-space: break-spaces');
  });

  it('keeps the default print rules for Pageless documents', () => {
    const html = docToHtmlDocument(doc);
    expect(html.match(/@page/g)).toHaveLength(1);
    expect(html).not.toMatch(/@page\s*\{\s*size/);
  });

  it('includes the given font faces, and nothing can close the style element', () => {
    const fontFaceCss = '@font-face { font-family: "Inter Variable"; src: url("/inter.woff2"); }';
    const html = docToHtmlDocument(doc, {
      fontFaceCss: fontFaceCss + '</style><script>x</script>',
    });
    expect(html).toContain(fontFaceCss);
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    // Inert text inside the style element, not an element of its own.
    expect(html.indexOf('<script')).toBeLessThan(html.indexOf('</style>'));
  });

  it('ignores an editor font size or letter spacing that is not a plain CSS length', () => {
    const pages = schema.nodeFromJSON({ ...doc.toJSON(), attrs: { page: { layout: 'pages' } } });
    const html = docToHtmlDocument(pages, {
      editorFontSize: '1px; color: red',
      editorLetterSpacing: '1px; background: url(https://tracker)',
    });
    expect(html).toContain('body { font-size: 14px; letter-spacing: normal; }');
    expect(html).not.toContain('color: red');
    expect(html).not.toContain('tracker');
  });

  it('keeps code blocks and table rows on one printed page', () => {
    const print = HTML_DOCUMENT_CSS.slice(HTML_DOCUMENT_CSS.indexOf('@media print'));
    const rule = print.match(/([^{}]+)\{[^}]*break-inside:\s*avoid/);
    expect(rule).not.toBeNull();
    const selectors = rule![1].split(',').map((s) => s.trim());
    expect(selectors).toEqual(expect.arrayContaining(['pre', 'tr', 'img', '.callout']));
  });
});
