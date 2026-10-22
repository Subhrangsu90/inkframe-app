import { describe, it, expect } from 'vitest';
import { schema } from '../schema/schema';
import { docToHtmlDocument, HTML_DOCUMENT_CSS } from './html-document';
import { findPageColor } from '../extensions/page-setup/page-setup';

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

  const withPage = (page: object) =>
    schema.nodeFromJSON({ ...doc.toJSON(), attrs: { page: { layout: 'pages', ...page } } });

  it('shows the page color on screen, and prints white paper unless asked to print it', () => {
    const cream = findPageColor('cream')!.light;
    const html = docToHtmlDocument(withPage({ color: 'cream' }));
    expect(html).toContain(`.ink-document, .ink-print-page { background: ${cream}; }`);
    const print = html.slice(html.lastIndexOf('@media print'));
    expect(print).toContain('.ink-document { background: transparent; }');
    expect(print).toContain('.ink-print-page { background: #ffffff; }');
    expect(print).not.toContain(cream);
  });

  it('prints the page color over the whole sheet, margins included, when asked', () => {
    const cream = findPageColor('cream')!.light;
    const html = docToHtmlDocument(withPage({ color: 'cream', printColor: true }));
    const print = html.slice(html.lastIndexOf('@media print'));
    expect(print).toContain(`@page { background: ${cream}; }`);
    expect(print).toContain(`html, body, .ink-print-page { background: ${cream}; }`);
  });

  it('sets the text in the document font, with code still in mono', () => {
    const serif = docToHtmlDocument(withPage({ font: 'serif' }));
    expect(serif).toContain("body { font-family: 'Source Serif 4 Variable',");
    expect(serif).toMatch(/code, pre \{ font-family: 'JetBrains Mono Variable'/);
    // Pageless too: the font is not a Pages setting.
    const pageless = schema.nodeFromJSON({ ...doc.toJSON(), attrs: { page: { font: 'mono' } } });
    expect(docToHtmlDocument(pageless)).toContain("body { font-family: 'JetBrains Mono Variable',");
    expect(docToHtmlDocument(doc)).not.toMatch(/body \{ font-family/);
  });

  it('prints headers and footers in the document font when the printout flows by itself', () => {
    const html = docToHtmlDocument(withPage({ font: 'serif', footer: { text: 'Draft' } }));
    expect(html).toMatch(
      /@bottom-left \{ content: "Draft"; font: 11\.2px 'Source Serif 4 Variable'/,
    );
  });

  it('ignores a page color name it does not know', () => {
    const html = docToHtmlDocument(withPage({ color: 'neon', printColor: true }));
    expect(html).not.toMatch(/@page \{ background/);
  });

  it('starts a new printed page at each page break', () => {
    const breaks = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'page_break' },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ],
    });
    const html = docToHtmlDocument(breaks);
    expect(html).toContain('<div class="ink-page-break"');
    const print = HTML_DOCUMENT_CSS.slice(HTML_DOCUMENT_CSS.indexOf('@media print'));
    expect(print).toMatch(/\.ink-page-break \{ break-after: page;/);
  });

  describe("with page view's page starts", () => {
    const t = (text: string) => ({ type: 'text', text });
    const p = (text: string) => ({ type: 'paragraph', content: [t(text)] });
    const paged = (page: object, content: object[]) =>
      schema.nodeFromJSON({ type: 'doc', attrs: { page: { layout: 'pages', ...page } }, content });
    const marked = {
      header: { text: 'Report <b>draft</b>', align: 'left' },
      footer: { text: 'Inkframe', align: 'center' },
      pageNumbers: { position: 'bottom', align: 'right', format: 'page-of' },
    };
    const startOf = (doc: ReturnType<typeof paged>, text: string) => {
      let found = -1;
      doc.descendants((node, pos) => {
        if (found < 0 && node.isText && node.text!.startsWith(text)) found = pos;
        return found < 0;
      });
      return found;
    };
    const pagesOf = (html: string) =>
      [...html.matchAll(/<section class="ink-print-page">(.*?)<\/section>/g)].map((m) => m[1]);
    const bandText = (page: string, edge: string) =>
      [
        ...(page.match(new RegExp(`ink-page-band-${edge}[^>]*>(.*?)</div>`))?.[1] ?? '').matchAll(
          /<span[^>]*>(.*?)<\/span>/g,
        ),
      ].map((m) => m[1]);

    it('prints each page in its own box, with its header, footer and number', () => {
      const doc = paged(marked, [p('One'), p('Two'), { type: 'page_break' }, p('Three')]);
      const html = docToHtmlDocument(doc, { pageStarts: [startOf(doc, 'Two')] });
      expect(html).toContain('<main class="ink-document ink-paged">');
      expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
      const pages = pagesOf(html);
      expect(pages).toHaveLength(3);
      expect(pages.map((page) => bandText(page, 'bottom'))).toEqual([
        ['', 'Inkframe', 'Page 1 of 3'],
        ['', 'Inkframe', 'Page 2 of 3'],
        ['', 'Inkframe', 'Page 3 of 3'],
      ]);
      // The header text is text, never markup.
      expect(bandText(pages[0], 'top')).toEqual(['Report &lt;b&gt;draft&lt;/b&gt;', '', '']);
      expect(html).not.toContain('<div class="ink-page-break"');
    });

    it('leaves the first page bare when asked, and counts it', () => {
      const doc = paged({ ...marked, firstPage: false }, [p('One'), p('Two')]);
      const pages = pagesOf(docToHtmlDocument(doc, { pageStarts: [startOf(doc, 'Two')] }));
      expect(pages[0]).not.toContain('ink-page-band');
      expect(bandText(pages[1], 'bottom')[2]).toBe('Page 2 of 2');
    });

    it('starts no page after a page break at the end', () => {
      const doc = paged(marked, [p('One'), { type: 'page_break' }]);
      expect(pagesOf(docToHtmlDocument(doc, { pageStarts: [] }))).toHaveLength(1);
    });

    it('flows without page starts, with the header and numbers as @page margin boxes', () => {
      const doc = paged(marked, [p('One'), p('Two')]);
      const html = docToHtmlDocument(doc, { pageStarts: null, editorFontSize: '15px' });
      expect(pagesOf(html)).toHaveLength(0);
      expect(html).toContain('margin: 25.4mm 25.4mm 25.4mm 25.4mm; }');
      expect(html).toMatch(
        /@bottom-right \{ content: "Page " counter\(page\) " of " counter\(pages\); font: 12px /,
      );
      // Pageless documents have no pages to number, with or without page starts.
      const pageless = docToHtmlDocument(paged({ ...marked, layout: 'pageless' }, [p('One')]), {
        pageStarts: [],
      });
      expect(pagesOf(pageless)).toHaveLength(0);
      expect(pageless).not.toContain('@bottom-right');
    });
  });

  it('keeps code blocks and table rows on one printed page', () => {
    const print = HTML_DOCUMENT_CSS.slice(HTML_DOCUMENT_CSS.indexOf('@media print'));
    const rule = print.match(/([^{}]+)\{[^}]*break-inside:\s*avoid/);
    expect(rule).not.toBeNull();
    const selectors = rule![1].split(',').map((s) => s.trim());
    expect(selectors).toEqual(expect.arrayContaining(['pre', 'tr', 'img', '.callout']));
  });
});
