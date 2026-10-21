import { describe, it, expect } from 'vitest';
import { DOMParser as PMDOMParser, Node as PMNode } from 'prosemirror-model';
import { schema } from '../../schema/schema';
import { cleanPastedHtml, detectPasteSource, htmlHasText } from './paste-cleanup';
import {
  GOOGLE_DOCS_CLIPBOARD,
  IMAGE_ONLY_CLIPBOARD,
  WEB_PAGE_CLIPBOARD,
  WORD_CLIPBOARD,
} from './paste-cleanup.fixtures';

/** Cleans clipboard HTML and parses it with the schema, as a paste does. */
function paste(html: string): PMNode {
  const div = document.createElement('div');
  div.innerHTML = cleanPastedHtml(html);
  return PMDOMParser.fromSchema(schema).parse(div);
}

/** One line per block: `type[attrs]: text`, indented by nesting. */
function outline(node: PMNode, depth = 0): string[] {
  const lines: string[] = [];
  node.forEach((child) => {
    const indent = '  '.repeat(depth);
    if (child.isTextblock) {
      const name = child.type.name === 'heading' ? `h${child.attrs['level']}` : child.type.name;
      const align = child.attrs['align'] ? `[${child.attrs['align']}]` : '';
      lines.push(`${indent}${name}${align}: ${child.textContent}`);
    } else {
      const checked =
        child.type.name === 'task_item' ? `[${child.attrs['checked'] ? 'x' : ' '}]` : '';
      lines.push(`${indent}${child.type.name}${checked}`, ...outline(child, depth + 1));
    }
  });
  return lines;
}

/** The marks on the first text node containing `text`, as { name: color | href | true }. */
function marksOn(doc: PMNode, text: string): Record<string, unknown> {
  let found: PMNode | undefined;
  doc.descendants((n) => {
    if (!found && n.isText && n.text!.includes(text)) found = n;
    return !found;
  });
  expect(found, `text "${text}"`).toBeDefined();
  return Object.fromEntries(
    found!.marks.map((m) => [m.type.name, m.attrs['color'] ?? m.attrs['href'] ?? true]),
  );
}

function textNodes(doc: PMNode): PMNode[] {
  const out: PMNode[] = [];
  doc.descendants((n) => {
    if (n.isText) out.push(n);
  });
  return out;
}

describe('detectPasteSource', () => {
  it('recognises Word, Google Docs and everything else', () => {
    expect(detectPasteSource(WORD_CLIPBOARD)).toBe('word');
    expect(detectPasteSource(GOOGLE_DOCS_CLIPBOARD)).toBe('google-docs');
    expect(detectPasteSource(WEB_PAGE_CLIPBOARD)).toBe('other');
  });
});

describe('Paste from Microsoft Word', () => {
  const doc = paste(WORD_CLIPBOARD);

  it('keeps the structure: title, alignment, nested and numbered lists, headings', () => {
    expect(outline(doc)).toEqual([
      'h1: Quarterly report',
      'paragraph[center]: Prepared for the board.',
      'paragraph: Bold, italic, underlined and highlighted text.',
      'paragraph: ',
      'bullet_list',
      '  list_item',
      '    paragraph: First point',
      '    bullet_list',
      '      list_item',
      '        paragraph: A detail',
      '  list_item',
      '    paragraph: Second point',
      'ordered_list',
      '  list_item',
      '    paragraph: Step one',
      '  list_item',
      '    paragraph: Step two',
      'h2: Next steps',
      'paragraph: Read the full plan and compare H2O with x2.',
      'paragraph: ',
    ]);
  });

  it('keeps formatting the writer chose and drops Word defaults', () => {
    expect(marksOn(doc, 'Bold')).toEqual({ strong: true });
    expect(marksOn(doc, 'italic')).toEqual({ em: true });
    expect(marksOn(doc, 'underlined')).toEqual({ underline: true });
    expect(marksOn(doc, 'highlighted')).toEqual({ highlight: 'yellow' });
    expect(Object.keys(marksOn(doc, 'board'))).toEqual(['strong', 'textColor']);
    expect(marksOn(doc, 'board')['textColor']).toMatch(/#C00000|rgb\(192, 0, 0\)/i);
    expect(marksOn(doc, 'Prepared for the')).toEqual({}); // color:windowtext dropped
    expect(marksOn(doc, 'full plan')).toEqual({ link: 'https://example.com/plan' });
    const scripts = textNodes(doc)
      .filter((n) => n.text === '2')
      .map((n) => n.marks.map((m) => m.type.name));
    expect(scripts).toEqual([['subscript'], ['superscript']]);
  });

  it('removes list markers, Office markup and images that point to local temp files', () => {
    const html = cleanPastedHtml(WORD_CLIPBOARD);
    expect(html).not.toMatch(/mso-|MsoNormal|o:p|StartFragment|·|file:\/\//);
    expect(textNodes(doc).some((n) => n.text!.includes('·'))).toBe(false);
    let images = 0;
    doc.descendants((n) => {
      if (n.type.name === 'image') images++;
    });
    expect(images).toBe(0);
  });
});

describe('Paste from Google Docs', () => {
  const doc = paste(GOOGLE_DOCS_CLIPBOARD);

  it('keeps headings, alignment, nested lists and checklists', () => {
    expect(outline(doc)).toEqual([
      'h1: Launch plan',
      'paragraph[center]: Bold, italic, underlined and highlighted.',
      'paragraph: ',
      'bullet_list',
      '  list_item',
      '    paragraph: Outer item',
      '    bullet_list',
      '      list_item',
      '        paragraph: Nested item',
      '  list_item',
      '    paragraph: Second item',
      'paragraph: ',
      'task_list',
      '  task_item[x]',
      '    paragraph: Done task',
      '  task_item[ ]',
      '    paragraph: Open task',
      'paragraph: E = mc2 and a link.',
    ]);
  });

  it('keeps bold, italic, underline, highlight, superscript and links, without black text color', () => {
    expect(marksOn(doc, 'Bold')).toEqual({ strong: true });
    expect(marksOn(doc, 'italic')).toEqual({ em: true });
    expect(marksOn(doc, 'underlined')).toEqual({ underline: true });
    expect(marksOn(doc, 'highlighted')['highlight']).toMatch(/#ffff00|rgb\(255, 255, 0\)/i);
    expect(marksOn(doc, '2')).toEqual({ superscript: true });
    // The link's own blue and underline are link styling, not formatting.
    expect(marksOn(doc, 'link')).toEqual({ link: 'https://example.com/' });
    expect(textNodes(doc).some((n) => n.marks.some((m) => m.type.name === 'textColor'))).toBe(
      false,
    );
    expect(marksOn(doc, 'Launch plan')).toEqual({});
  });
});

describe('Paste from a web page', () => {
  const doc = paste(WEB_PAGE_CLIPBOARD);

  it("drops the page's text color, white background, heading weight and trailing line break", () => {
    expect(outline(doc)).toEqual([
      'h2: Getting started',
      'paragraph: Install it with npm install, then read the warning below.',
    ]);
    expect(marksOn(doc, 'Getting started')).toEqual({});
    expect(marksOn(doc, 'Install it with')).toEqual({});
    expect(marksOn(doc, 'npm install')).toEqual({ code: true });
    expect(marksOn(doc, 'warning')['textColor']).toMatch(/rgb\(207, 34, 46\)/);
  });
});

describe('Paragraph indents', () => {
  const indents = (doc: PMNode) => doc.children.map((n) => n.attrs['indent'] ?? 0);

  it('become indent levels from Google Docs (36pt a level) and Word (half an inch)', () => {
    const docs = paste(
      '<b style="font-weight:normal;" id="docs-internal-guid-1">' +
        '<p dir="ltr" style="line-height:1.38;margin-left: 36pt;margin-top:0pt"><span>one</span></p>' +
        '<p dir="ltr" style="margin-left: 72pt"><span>two</span></p>' +
        '<h2 dir="ltr" style="margin-left: 36pt"><span>heading</span></h2>' +
        '<p dir="ltr" style="margin-left: 0pt"><span>none</span></p></b>',
    );
    expect(indents(docs)).toEqual([1, 2, 1, 0]);
    expect(docs.child(0).attrs['lineSpacing']).toBeNull(); // Google Docs' default spacing is not kept

    const word = paste(
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>' +
        "<p class=MsoNormal style='margin-left:.5in'>half</p>" +
        "<p class=MsoNormal style='margin-left:1.27cm'>metric</p>" +
        "<p class=MsoNormal style='margin-left:9in'>far</p>" +
        "<p class=MsoNormal style='margin-left:.1in'>nudge</p></body></html>",
    );
    expect(indents(word)).toEqual([1, 1, 8, 0]);
  });

  it('are not read from web pages, or inside list items, where the margin is the list', () => {
    expect(indents(paste('<p style="margin-left: 48px">web</p>'))).toEqual([0]);
    const list = paste(
      '<b id="docs-internal-guid-2"><ul><li style="margin-left: 36pt"><p style="margin-left: 36pt">item</p></li></ul></b>',
    );
    expect(list.child(0).child(0).child(0).attrs['indent']).toBeNull();
  });
});

describe('cleanPastedHtml', () => {
  it('leaves content copied from an Inkframe editor untouched', () => {
    const internal = '<p data-pm-slice="1 1 []"><span style="color: #1f2937">dark text</span></p>';
    expect(cleanPastedHtml(internal)).toBe(internal);
  });

  it('removes scripts and event handlers', () => {
    const html = cleanPastedHtml(
      '<p onclick="alert(1)">hi<script>alert(2)</script><img src="x.png" onerror="alert(3)"></p>',
    );
    expect(html).not.toMatch(/script|onclick|onerror/);
    expect(html).toContain('hi');
  });

  it('keeps deliberate colors and drops near-black and near-white ones', () => {
    const doc = paste(
      '<p><span style="color: #333333">grey</span> <span style="color: #2563eb">blue</span> ' +
        '<span style="color: rgb(230, 237, 243)">pale</span> ' +
        '<span style="background-color: #fafafa">page</span> <span style="background: #fde68a">marker</span></p>',
    );
    expect(marksOn(doc, 'grey')).toEqual({});
    expect(marksOn(doc, 'pale')).toEqual({});
    expect(marksOn(doc, 'page')).toEqual({});
    expect(marksOn(doc, 'blue')['textColor']).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    expect(marksOn(doc, 'marker')['highlight']).toMatch(/#fde68a|rgb\(253, 230, 138\)/);
  });
});

describe('htmlHasText', () => {
  it('tells text pastes from image-only ones', () => {
    expect(htmlHasText(WORD_CLIPBOARD)).toBe(true);
    expect(htmlHasText(IMAGE_ONLY_CLIPBOARD)).toBe(false);
    expect(htmlHasText('')).toBe(false);
  });
});
