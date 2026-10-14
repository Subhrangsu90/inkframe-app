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

  it('keeps code blocks and table rows on one printed page', () => {
    const print = HTML_DOCUMENT_CSS.slice(HTML_DOCUMENT_CSS.indexOf('@media print'));
    const rule = print.match(/([^{}]+)\{[^}]*break-inside:\s*avoid/);
    expect(rule).not.toBeNull();
    const selectors = rule![1].split(',').map((s) => s.trim());
    expect(selectors).toEqual(expect.arrayContaining(['pre', 'tr', 'img', '.callout']));
  });
});
