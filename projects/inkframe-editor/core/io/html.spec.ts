import { describe, it, expect } from 'vitest';
import { schema } from '../schema/schema';
import { docToHtml, htmlToDoc } from './html';

describe('HTML IO & Sanitization', () => {
  it('converts document to HTML', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Hello World')]),
    ]);
    const html = docToHtml(doc);
    expect(html).toContain('<p>Hello World</p>');
  });

  it('parses HTML and strips harmful scripts using DOMPurify', () => {
    const dangerousHtml =
      '<p>Normal text</p><script>alert("XSS")</script><img src="x" onerror="alert(1)">';
    const doc = htmlToDoc(dangerousHtml);
    const outputHtml = docToHtml(doc);

    expect(outputHtml).toContain('Normal text');
    expect(outputHtml).not.toContain('<script>');
    expect(outputHtml).not.toContain('onerror');
  });
});
