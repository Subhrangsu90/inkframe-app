import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from './schema';
import { sanitizeCssColor, sanitizeCssLength } from './link-utils';
import { docToHtml, sanitizeHtml } from './io/html';
import { tableUIKey, tableUIPlugin } from './table-ui.plugin';

const injection = 'red; background-image: url(https://tracker.example/x)';

describe('style attribute sanitization', () => {
  it('accepts plain colors and lengths only', () => {
    for (const ok of [
      '#fff',
      '#7c3aed',
      'rgb(1, 2, 3)',
      'rgba(0,0,0,0.5)',
      'hsl(10 20% 30%)',
      'red',
    ]) {
      expect(sanitizeCssColor(ok)).toBe(ok);
    }
    for (const bad of [injection, 'url(x)', 'red;', 'expression(alert(1))', '', null, 42]) {
      expect(sanitizeCssColor(bad)).toBeNull();
    }
    expect(sanitizeCssLength('320px')).toBe('320px');
    expect(sanitizeCssLength('50%')).toBe('50%');
    expect(sanitizeCssLength('100px; background: url(x)')).toBeNull();
  });

  it('drops injected CSS from text colors, image widths and table cells in HTML output', () => {
    const cell = schema.nodes['table_cell'].create(
      { background: injection, height: '10px; color: red' },
      [schema.nodes['paragraph'].create(null, [schema.text('c')])],
    );
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('colored', [schema.marks['textColor'].create({ color: injection })]),
        schema.nodes['image'].create({
          src: 'https://example.com/a.png',
          width: '10px; background: url(x)',
        }),
      ]),
      schema.nodes['table'].create(null, [schema.nodes['table_row'].create(null, [cell])]),
    ]);
    const html = docToHtml(doc, { highlightCode: false });
    expect(html).not.toContain('url(');
    expect(html).not.toContain('tracker.example');
    expect(html).toContain('colored');
  });

  it('keeps valid style values in HTML output', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('colored', [schema.marks['textColor'].create({ color: '#ef4444' })]),
      ]),
    ]);
    // The DOM may normalise the hex value to rgb().
    expect(docToHtml(doc, { highlightCode: false })).toMatch(/color: (#ef4444|rgb\(239, 68, 68\))/);
  });
});

describe('table UI widgets', () => {
  function makeView(text: string) {
    const cell = schema.nodes['table_cell'].create(null, [
      schema.nodes['paragraph'].create(null, [schema.text(text)]),
    ]);
    const table = schema.nodes['table'].create(null, [
      schema.nodes['table_row'].create(null, [cell]),
    ]);
    const state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [table]),
      plugins: [tableUIPlugin()],
    });
    const view = new EditorView(document.createElement('div'), { state });
    return view;
  }

  it('act on the editor that rendered them, not the last one mounted', () => {
    const first = makeView('first');
    const second = makeView('second'); // mounted last

    const rowWidget = tableUIKey
      .getState(first.state)
      .find()
      .find(
        (d: any) =>
          typeof d.type.toDOM === 'function' &&
          d.type.toDOM(first, () => d.from).className === 'ink-table-row-handle',
      );
    const handle = rowWidget.type.toDOM(first, () => rowWidget.from) as HTMLElement;
    handle.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(first.state.doc.firstChild!.childCount).toBe(2);
    expect(second.state.doc.firstChild!.childCount).toBe(1);
    first.destroy();
    second.destroy();
  });
});

describe('sanitizeHtml', () => {
  it('strips script and event handlers but keeps editor markup', () => {
    const html =
      '<p class="x" data-checked="true" style="color: red">ok</p>' +
      '<a href="https://example.com" target="_blank" rel="noopener">link</a>' +
      '<img src="x" onerror="alert(1)"><script>alert(2)</script>' +
      '<a href="javascript:alert(3)">bad</a>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('class="x"');
    expect(clean).toContain('data-checked="true"');
    expect(clean).toContain('style="color: red"');
    expect(clean).toContain('target="_blank"');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('javascript:');
  });
});

describe('htmlToDoc attribute handling', () => {
  it('keeps colspan and image widths, and drops unsafe links', async () => {
    const { htmlToDoc } = await import('./io/html');
    const doc = htmlToDoc(
      '<table><tr><td colspan="2"><p>wide</p></td></tr></table>' +
        '<p><img src="data:image/png;base64,AAAA" width="320px">' +
        '<a href="javascript:alert(1)">x</a><a href="https://example.com">y</a></p>',
    );
    let colspan = 0;
    let width: string | null = null;
    let imgSrc = '';
    const hrefs: string[] = [];
    doc.descendants((n) => {
      if (n.type.name === 'table_cell') colspan = n.attrs['colspan'];
      if (n.type.name === 'image') {
        width = n.attrs['width'];
        imgSrc = n.attrs['src'];
      }
      n.marks.forEach((m) => m.type.name === 'link' && hrefs.push(m.attrs['href']));
    });
    expect(colspan).toBe(2);
    expect(width).toBe('320px');
    expect(imgSrc.startsWith('data:image/png')).toBe(true);
    expect(hrefs).toEqual(['https://example.com']);
  });
});
