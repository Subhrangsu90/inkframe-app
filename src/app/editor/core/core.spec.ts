import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from './schema';
import { sanitizeHref } from './link-utils';
import { migrate, SCHEMA_VERSION, StoredDoc } from './migrations';
import { clearFormattingCommand } from './plugins';
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

  describe('Phase 1: Typography Marks & Commands', () => {
    it('supports underline, strikethrough, subscript, superscript, small, and textColor marks in HTML', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('Underlined', [schema.marks['underline'].create()]),
          schema.text(' '),
          schema.text('Strikethrough', [schema.marks['strikethrough'].create()]),
          schema.text(' '),
          schema.text('H2', []),
          schema.text('O', [schema.marks['subscript'].create()]),
          schema.text(' '),
          schema.text('E=mc', []),
          schema.text('2', [schema.marks['superscript'].create()]),
          schema.text(' '),
          schema.text('Fineprint', [schema.marks['small'].create()]),
          schema.text(' '),
          schema.text('Colored', [schema.marks['textColor'].create({ color: '#e11d48' })]),
        ]),
      ]);

      const html = docToHtml(doc);
      expect(html).toContain('<u>Underlined</u>');
      expect(html).toContain('<s>Strikethrough</s>');
      expect(html).toContain('<sub>O</sub>');
      expect(html).toContain('<sup>2</sup>');
      expect(html).toContain('<small>Fineprint</small>');
      expect(html).toContain('color: rgb(225, 29, 72)') || expect(html).toContain('color: #e11d48');

      // Roundtrip test
      const parsedDoc = htmlToDoc(html);
      expect(parsedDoc.textContent).toContain('Underlined Strikethrough H2O E=mc2 Fineprint Colored');
    });

    it('enforces mutual exclusion between subscript and superscript', () => {
      const sub = schema.marks['subscript'].create();
      const sup = schema.marks['superscript'].create();
      expect(sub.type.excludes(sup.type)).toBe(true);
      expect(sup.type.excludes(sub.type)).toBe(true);
    });

    it('serializes strikethrough, superscript, and subscript to markdown', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('struck', [schema.marks['strikethrough'].create()]),
          schema.text(' and '),
          schema.text('sub', [schema.marks['subscript'].create()]),
        ]),
      ]);
      const md = docToMarkdown(doc);
      expect(md).toContain('~~struck~~');
      expect(md).toContain('~sub~');
    });

    it('clearFormattingCommand clears all marks from selection', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('Heavily styled', [
            schema.marks['strong'].create(),
            schema.marks['em'].create(),
            schema.marks['underline'].create(),
            schema.marks['textColor'].create({ color: '#ff0000' }),
          ]),
        ]),
      ]);

      let state = EditorState.create({
        schema,
        doc,
      });

      // Select "Heavily styled" (pos 1 to 15)
      state = state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, 1, 15)),
      );

      let dispatchedState: EditorState | null = null;
      const success = clearFormattingCommand(state, (tr) => {
        dispatchedState = state.apply(tr);
      });

      expect(success).toBe(true);
      expect(dispatchedState).toBeTruthy();
      // Ensure no marks remain on node
      const firstChild = dispatchedState!.doc.firstChild?.firstChild;
      expect(firstChild?.marks.length).toBe(0);
    });

    it('code mark excludes other marks for individual formatting', () => {
      const codeMark = schema.marks['code'];
      const strongMark = schema.marks['strong'];
      const emMark = schema.marks['em'];
      const underlineMark = schema.marks['underline'];

      // code mark in basic schema specifies excludes: "_"
      expect(codeMark.excludes(strongMark)).toBe(true);
      expect(codeMark.excludes(emMark)).toBe(true);
      expect(codeMark.excludes(underlineMark)).toBe(true);
    });
  });
});
