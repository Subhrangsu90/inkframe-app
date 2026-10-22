import { describe, it, expect } from 'vitest';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown } from '../../io/markdown';

describe('Formatting marks', () => {
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
    expect(html.includes('color: rgb(225, 29, 72)') || html.includes('color: #e11d48')).toBe(true);

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
    expect(md).toContain('<sub>sub</sub>');
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

  it('creates and serializes underline mark', () => {
    const mark = schema.marks['underline'].create();
    const node = schema.text('Underlined text', [mark]);
    const p = schema.nodes['paragraph'].create(null, [node]);
    const doc = schema.node('doc', null, [p]);
    const html = docToHtml(doc);
    expect(html).toContain('<u>Underlined text</u>');

    const parsed = htmlToDoc(html);
    expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'underline')).toBe(
      true,
    );
  });

  it('creates and serializes strikethrough mark', () => {
    const mark = schema.marks['strikethrough'].create();
    const node = schema.text('Struck text', [mark]);
    const p = schema.nodes['paragraph'].create(null, [node]);
    const doc = schema.node('doc', null, [p]);
    const html = docToHtml(doc);
    expect(html).toContain('<s>Struck text</s>');

    const parsed = htmlToDoc(html);
    expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'strikethrough')).toBe(
      true,
    );
  });

  it('creates and serializes subscript and superscript marks', () => {
    const subMark = schema.marks['subscript'].create();
    const superMark = schema.marks['superscript'].create();

    const p = schema.nodes['paragraph'].create(null, [
      schema.text('H'),
      schema.text('2', [subMark]),
      schema.text('O and x'),
      schema.text('2', [superMark]),
    ]);
    const doc = schema.node('doc', null, [p]);
    const html = docToHtml(doc);

    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<sup>2</sup>');

    const parsed = htmlToDoc(html);
    let foundSub = false;
    let foundSuper = false;
    parsed.descendants((child) => {
      if (child.isText && child.marks.some((m) => m.type.name === 'subscript')) {
        foundSub = true;
      }
      if (child.isText && child.marks.some((m) => m.type.name === 'superscript')) {
        foundSuper = true;
      }
    });
    expect(foundSub).toBe(true);
    expect(foundSuper).toBe(true);
  });

  it('creates and serializes small mark', () => {
    const smallMark = schema.marks['small'].create();
    const node = schema.text('Fine print', [smallMark]);
    const p = schema.nodes['paragraph'].create(null, [node]);
    const doc = schema.node('doc', null, [p]);
    const html = docToHtml(doc);

    expect(html).toContain('<small>Fine print</small>');

    const parsed = htmlToDoc(html);
    expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'small')).toBe(true);
  });
});
