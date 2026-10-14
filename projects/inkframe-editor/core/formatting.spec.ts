import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { DEFAULT_HIGHLIGHT_COLOR, schema } from './schema/schema';
import {
  removeHighlightCommand,
  setHighlightCommand,
  toggleHighlightCommand,
} from './extensions/commands';
import { docToHtml, htmlToDoc } from './io/html';
import { docToMarkdown, markdownToDoc } from './io/markdown';
import { SCHEMA_VERSION, StoredDoc, migrate } from './schema/migrations';

const { nodes, marks } = schema;
const text = (t: string, m: ReturnType<typeof marks.highlight.create>[] = []) => schema.text(t, m);
const p = (content: string | PMNode[] = [], align: string | null = null) =>
  nodes['paragraph'].create(
    { align },
    typeof content === 'string' ? (content ? [text(content)] : []) : content,
  );
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);

function stateWith(d: PMNode, from = 1, to = from): EditorState {
  const state = EditorState.create({ schema, doc: d });
  return state.apply(state.tr.setSelection(TextSelection.create(d, from, to)));
}

function run(state: EditorState, command: (s: EditorState, d?: any) => boolean): EditorState {
  let next = state;
  command(state, (tr: any) => (next = state.apply(tr)));
  return next;
}

describe('Highlight mark', () => {
  it('serializes to <mark> with the color and parses back losslessly', () => {
    const d = doc(
      p([text('plain '), text('marked', [marks['highlight'].create({ color: '#bbf7d0' })])]),
    );
    const html = docToHtml(d);
    // DOM implementations may serialize the style as rgb() and add a semicolon.
    expect(html).toMatch(
      /<mark data-color="#bbf7d0" style="background-color: (#bbf7d0|rgb\(187, 247, 208\));?">marked<\/mark>/,
    );
    expect(htmlToDoc(html).eq(d)).toBe(true);
  });

  it('parses a plain <mark> with the default color and a background span as a highlight', () => {
    const plain = htmlToDoc(
      '<p><mark>a</mark> <span style="background-color: #fecaca">b</span></p>',
    );
    const markAt = (pos: number) =>
      plain.nodeAt(pos)!.marks.find((m) => m.type.name === 'highlight');
    expect(markAt(1)?.attrs['color']).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(markAt(3)?.attrs['color']).toMatch(/#fecaca|rgb\(254, 202, 202\)/);
  });

  it('ignores transparent backgrounds and keeps table cell backgrounds on the cell', () => {
    const d = htmlToDoc(
      '<p><span style="background-color: transparent">a</span><span style="background-color: rgba(0, 0, 0, 0)">b</span></p>' +
        '<table><tr><td style="background-color: #fef08a"><p>cell</p></td></tr></table>',
    );
    let highlights = 0;
    d.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'highlight')) highlights++;
    });
    expect(highlights).toBe(0);
    const cell = d.child(1).child(0).child(0);
    expect(cell.attrs['background']).toMatch(/#fef08a|rgb\(254, 240, 138\)/);
  });

  it('never writes unsafe colors into the style attribute', () => {
    const d = doc(
      p([
        text('x', [marks['highlight'].create({ color: 'red; background:url(https://t.example)' })]),
      ]),
    );
    const html = docToHtml(d);
    expect(html).not.toContain('url(');
    expect(html).toContain(`data-color="${DEFAULT_HIGHLIGHT_COLOR}"`);
    expect(html).toMatch(/background-color: (#fef08a|rgb\(254, 240, 138\))/);
  });

  it('commands set, replace, toggle and remove the highlight', () => {
    let state = stateWith(doc(p('hello world')), 1, 6);
    state = run(state, setHighlightCommand('#bfdbfe'));
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe('#bfdbfe');

    state = run(state, setHighlightCommand('#fecaca'));
    expect(state.doc.nodeAt(1)!.marks).toHaveLength(1);
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe('#fecaca');

    state = run(state, toggleHighlightCommand);
    expect(state.doc.rangeHasMark(1, 6, marks['highlight'])).toBe(false);

    state = run(state, toggleHighlightCommand);
    expect(state.doc.nodeAt(1)!.marks[0].attrs['color']).toBe(DEFAULT_HIGHLIGHT_COLOR);

    state = run(state, removeHighlightCommand);
    expect(state.doc.rangeHasMark(1, 6, marks['highlight'])).toBe(false);
  });

  it('round-trips through Markdown as <mark> and reads ==text==', () => {
    const d = doc(
      p([
        text('a '),
        text('marked', [marks['highlight'].create({ color: '#e9d5ff' })]),
        text(' b'),
      ]),
    );
    const md = docToMarkdown(d);
    expect(md).toBe('a <mark style="background-color: #e9d5ff">marked</mark> b');
    expect(markdownToDoc(md).eq(d)).toBe(true);

    const fromObsidian = markdownToDoc('Some ==important **bold** words== here, a == b, x==y');
    const highlighted: string[] = [];
    fromObsidian.descendants((n) => {
      if (n.isText && n.marks.some((m) => m.type.name === 'highlight')) highlighted.push(n.text!);
    });
    expect(highlighted.join('')).toBe('important bold words');
    expect(fromObsidian.textContent).toContain('a == b');
  });
});

describe('Schema migrations', () => {
  it('migrates version 1 documents unchanged and loads them in the new schema', () => {
    const v1: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Old' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Body', marks: [{ type: 'strong' }] }],
          },
        ],
      },
    };
    expect(SCHEMA_VERSION).toBe(4);
    const migrated = migrate(v1);
    expect(migrated).toEqual(v1.doc);
    const node = schema.nodeFromJSON(migrated);
    node.check();
    expect(node.child(0).attrs).toEqual({ level: 1, align: null });
    expect(node.child(1).attrs).toEqual({ align: null });
  });

  it('drops fixed row heights from version 2 table cells', () => {
    const cell = (type: string, text: string) => ({
      type,
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: null,
        alignment: 'center',
        background: null,
        height: '48px',
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const v2: StoredDoc = {
      schemaVersion: 2,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              { type: 'table_row', content: [cell('table_header', 'Name')] },
              { type: 'table_row', content: [cell('table_cell', 'Ada')] },
            ],
          },
        ],
      },
    };
    const migrated = migrate(v2) as any;
    const migratedCells = migrated.content[0].content.map((row: any) => row.content[0]);
    expect(migratedCells.map((c: any) => 'height' in c.attrs)).toEqual([false, false]);
    expect(migratedCells[0].attrs.alignment).toBe('center');
    expect((v2.doc as any).content[0].content[0].content[0].attrs.height).toBe('48px'); // input untouched

    const node = schema.nodeFromJSON(migrated);
    node.check();
    expect(docToHtml(node)).not.toContain('height');
  });

  it('loads version 3 lists unchanged, with the new list attributes at their defaults', () => {
    const item = (text: string) => ({
      type: 'list_item',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const v3: StoredDoc = {
      schemaVersion: 3,
      doc: {
        type: 'doc',
        content: [
          { type: 'ordered_list', attrs: { order: 3 }, content: [item('three'), item('four')] },
          { type: 'bullet_list', content: [item('dot')] },
        ],
      },
    };
    const migrated = migrate(v3);
    expect(migrated).toEqual(v3.doc);
    const node = schema.nodeFromJSON(migrated);
    node.check();
    expect(node.child(0).attrs).toEqual({
      order: 3,
      bulletStyle: null,
      numberStyle: null,
      tight: true,
    });
    expect(node.child(1).attrs['bulletStyle']).toBeNull();
  });

  it('ignores row heights in pasted or imported HTML', () => {
    const d = htmlToDoc('<table><tr><td style="height: 120px"><p>tall</p></td></tr></table>');
    const cell = d.child(0).child(0).child(0);
    expect(cell.attrs).not.toHaveProperty('height');
    expect(docToHtml(d)).not.toContain('120px');
  });
});
