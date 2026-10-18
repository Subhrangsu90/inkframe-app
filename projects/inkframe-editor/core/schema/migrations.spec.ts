import { describe, it, expect } from 'vitest';
import { schema } from './schema';
import { SCHEMA_VERSION, StoredDoc, migrate } from './migrations';
import { docToHtml, htmlToDoc } from '../io/html';
import {
  DEFAULT_PAGE_SETUP,
  pageSetupOf,
  storedPageSetupOf,
} from '../extensions/page-setup/page-setup';

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
    expect(SCHEMA_VERSION).toBe(5);
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

  it('loads version 4 documents unchanged, as Pageless', () => {
    const v4: StoredDoc = {
      schemaVersion: 4,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before page setup' }] }],
      },
    };
    const migrated = migrate(v4);
    expect(migrated).toEqual(v4.doc);
    const node = schema.nodeFromJSON(migrated);
    node.check();
    expect(node.attrs).toEqual({ page: null });
    expect(storedPageSetupOf(node)).toBeNull();
    expect(pageSetupOf(node)).toEqual(DEFAULT_PAGE_SETUP);
    expect(pageSetupOf(node).layout).toBe('pageless');
  });

  it('ignores row heights in pasted or imported HTML', () => {
    const d = htmlToDoc('<table><tr><td style="height: 120px"><p>tall</p></td></tr></table>');
    const cell = d.child(0).child(0).child(0);
    expect(cell.attrs).not.toHaveProperty('height');
    expect(docToHtml(d)).not.toContain('120px');
  });
});
