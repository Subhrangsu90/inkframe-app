import { describe, it, expect } from 'vitest';
import { schema } from './schema';
import { sanitizeHref } from './link-utils';
import { migrate, SCHEMA_VERSION, StoredDoc } from './migrations';
import { docToHtml, htmlToDoc } from '../io/html';
import { docToMarkdown, markdownToDoc } from '../io/markdown';
import { imageStorage } from './image-storage';

describe('Inkframe Core', () => {
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

  describe('Migrations', () => {
    it('passes through documents matching current schemaVersion', () => {
      const stored: StoredDoc = {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hello Inkframe' }],
            },
          ],
        },
      };

      const result = migrate(stored);
      expect(result).toEqual(stored.doc);
    });

    it('throws error for future unknown schema versions', () => {
      const futureDoc: StoredDoc = {
        schemaVersion: 999,
        doc: { type: 'doc' },
      };
      expect(() => migrate(futureDoc)).toThrow(/newer schema/);
    });
  });

  describe('HTML IO & Sanitization', () => {
    it('converts document to HTML', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello World')]),
      ]);
      const html = docToHtml(doc);
      expect(html).toContain('<p>Hello World</p>');
    });

    it('parses HTML and strips harmful scripts using DOMPurify', () => {
      const dangerousHtml = '<p>Normal text</p><script>alert("XSS")</script><img src="x" onerror="alert(1)">';
      const doc = htmlToDoc(dangerousHtml);
      const outputHtml = docToHtml(doc);

      expect(outputHtml).toContain('Normal text');
      expect(outputHtml).not.toContain('<script>');
      expect(outputHtml).not.toContain('onerror');
    });
  });

  describe('Markdown IO', () => {
    it('converts markdown to document and back to markdown', () => {
      const inputMd = '# Heading 1\n\nThis is **bold** text and `code`.';
      const doc = markdownToDoc(inputMd);
      expect(doc).toBeTruthy();
      expect(doc.type.name).toBe('doc');

      const serialized = docToMarkdown(doc);
      expect(serialized).toContain('# Heading 1');
      expect(serialized).toContain('**bold**');
      expect(serialized).toContain('`code`');
    });

    it('serializes and parses callout and table blocks', () => {
      const doc = schema.node('doc', null, [
        schema.node('callout', { type: 'info' }, [
          schema.node('paragraph', null, [schema.text('Important notice')]),
        ]),
      ]);
      const md = docToMarkdown(doc);
      expect(md).toContain('> [!INFO]');
      expect(md).toContain('Important notice');
    });
  });

  describe('Image Storage (IndexedDB)', () => {
    it('returns original URL for external links', async () => {
      const extUrl = 'https://example.com/cat.png';
      const resolved = await imageStorage.resolveUrl(extUrl);
      expect(resolved).toBe(extUrl);
    });
  });
});
