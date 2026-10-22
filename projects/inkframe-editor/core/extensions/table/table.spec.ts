import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { tableUIKey, tableUIPlugin } from './table-ui.plugin';
import { tableNodes } from 'prosemirror-tables';
import { DOMParser as PMDOMParser, DOMSerializer, NodeSpec, Schema } from 'prosemirror-model';
import { tableNodeSpecs } from './table-schema';
import { sanitizeCssColor } from '../../schema/sanitize-css';

describe('Table cells and handles', () => {
  it('supports cell alignment and background attributes in schema', () => {
    const cell = schema.nodes['table_cell'].create({ alignment: 'center', background: '#1e3a5f' }, [
      schema.nodes['paragraph'].create(null, [schema.text('Centered Cell')]),
    ]);

    expect(cell.attrs['alignment']).toBe('center');
    expect(cell.attrs['background']).toBe('#1e3a5f');

    const row = schema.nodes['table_row'].create(null, [cell]);
    const table = schema.nodes['table'].create(null, [row]);
    const doc = schema.node('doc', null, [table]);

    const html = docToHtml(doc);
    expect(html).toContain('text-align: center');
    expect(html).toContain('background-color: rgb(30, 58, 95)');

    const parsed = htmlToDoc(html);
    let foundCell = false;
    parsed.descendants((node) => {
      if (node.type.name === 'table_cell') {
        foundCell = true;
        expect(node.attrs['alignment']).toBe('center');
        expect(node.attrs['background']).toMatch(/#1e3a5f|rgb\(30, 58, 95\)/i);
      }
    });
    expect(foundCell).toBe(true);
  });

  it('tableUIPlugin generates column handles, row handles, and empty cell placeholders', () => {
    const emptyCell = schema.nodes['table_cell'].create(null, [schema.nodes['paragraph'].create()]);
    const filledCell = schema.nodes['table_cell'].create(null, [
      schema.nodes['paragraph'].create(null, [schema.text('Data')]),
    ]);

    const row1 = schema.nodes['table_row'].create(null, [emptyCell, filledCell]);
    const row2 = schema.nodes['table_row'].create(null, [filledCell, emptyCell]);
    const table = schema.nodes['table'].create(null, [row1, row2]);
    const doc = schema.node('doc', null, [table]);

    const state = EditorState.create({
      doc,
      schema,
      plugins: [tableUIPlugin()],
    });

    const decos = tableUIKey.getState(state);
    expect(decos).toBeDefined();

    const allDecos = decos.find(0, doc.nodeSize);
    expect(allDecos.length).toBeGreaterThan(0);

    // Widgets are render functions that receive the view at render time.
    const view = { editable: true } as any;
    const classOf = (d: any) => {
      const toDOM = d.type?.toDOM;
      const el = typeof toDOM === 'function' ? toDOM(view, () => d.from) : toDOM;
      return (el && el.className) || '';
    };

    // Check for row handles (first cell of row1 and row2)
    const hasRowHandle = allDecos.some((d: any) => classOf(d).includes('ink-table-row-handle'));
    expect(hasRowHandle).toBe(true);

    // Check for column header handles (in first row)
    const hasColHandle = allDecos.some((d: any) =>
      classOf(d).includes('ink-table-col-header-handle'),
    );
    expect(hasColHandle).toBe(true);

    // Check for empty cell placeholder in emptyCell
    const hasPlaceholder = allDecos.some((d: any) =>
      classOf(d).includes('ink-table-cell-placeholder'),
    );
    expect(hasPlaceholder).toBe(true);
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

describe('Table node specs', () => {
  // The specs prosemirror-tables builds, with the cell attributes table-schema.ts
  // gives its own copy: the two must stay the same.
  const theirs = tableNodes({
    tableGroup: 'block',
    cellContent: 'block+',
    cellAttributes: {
      alignment: {
        default: null,
        getFromDOM(dom) {
          const value = (dom as HTMLElement).style.textAlign;
          return value === 'left' || value === 'center' || value === 'right' ? value : null;
        },
        setDOMAttr(value, attrs) {
          if (value === 'left' || value === 'center' || value === 'right') {
            attrs['style'] = (attrs['style'] || '') + `text-align: ${value};`;
          }
        },
      },
      background: {
        default: null,
        getFromDOM(dom) {
          return sanitizeCssColor((dom as HTMLElement).style.backgroundColor);
        },
        setDOMAttr(value, attrs) {
          const color = sanitizeCssColor(value);
          if (color) attrs['style'] = (attrs['style'] || '') + `background-color: ${color};`;
        },
      },
    },
  });
  const schemaWith = (tables: Record<string, NodeSpec>) =>
    new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'text*',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0],
        },
        text: {},
        ...tables,
      },
    });
  const describeSpec = (spec: NodeSpec) => ({
    ...spec,
    attrs: Object.fromEntries(
      Object.entries(spec.attrs ?? {}).map(([name, a]) => [
        name,
        { ...a, validate: typeof a.validate },
      ]),
    ),
    parseDOM: spec.parseDOM?.map((rule) => ({ ...rule, getAttrs: typeof rule.getAttrs })),
    toDOM: typeof spec.toDOM,
  });

  it('are the ones prosemirror-tables builds', () => {
    for (const name of ['table', 'table_row', 'table_cell', 'table_header'] as const) {
      expect(describeSpec(tableNodeSpecs[name]), name).toEqual(describeSpec(theirs[name]));
    }
  });

  it('read and write tables the same way', () => {
    const html =
      '<table><tbody><tr><th colspan="2" data-colwidth="80,120" style="text-align: center">Head</th></tr>' +
      '<tr><td rowspan="2" style="background-color: #1e3a5f">A</td><td data-colwidth="9,9">B</td></tr>' +
      '<tr><td style="text-align: right; background-color: url(x)">C</td></tr></tbody></table>';
    const dom = new DOMParser().parseFromString(html, 'text/html').body;
    const read = (s: Schema) => PMDOMParser.fromSchema(s).parse(dom);
    const write = (s: Schema) => {
      const div = document.createElement('div');
      div.appendChild(DOMSerializer.fromSchema(s).serializeFragment(read(s).content));
      return div.innerHTML;
    };
    const ours = schemaWith(tableNodeSpecs);
    const original = schemaWith(theirs);
    expect(read(ours).toJSON()).toEqual(read(original).toJSON());
    expect(write(ours)).toBe(write(original));
    expect(write(ours)).toContain('colspan="2" data-colwidth="80,120" style="text-align: center;"');
  });
});
