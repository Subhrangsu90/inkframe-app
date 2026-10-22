import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SCHEMA_VERSION, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import {
  BACKUP_FORMAT,
  BackupError,
  BackupService,
  InkframeBackup,
  describeRestore,
} from './backup';
import { DocumentManager } from '../data-access/document-manager';
import { VersionHistory } from '../versions/version-history';

const docWith = (text: string, imageId?: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text },
          ...(imageId ? [{ type: 'image', attrs: { src: `ink-idb:${imageId}` } }] : []),
        ],
      },
    ],
  },
});

/** Writes the backup to text and reads it back, as a file would. */
const throughFile = (service: BackupService, backup: InkframeBackup) =>
  service.parse(JSON.stringify(backup));

// jsdom has no IndexedDB: documents use the localStorage fallback and images
// stay in memory, which is enough to round-trip them.
describe('BackupService', () => {
  let backups: BackupService;
  let docs: DocumentManager;
  let versions: VersionHistory;

  beforeEach(async () => {
    localStorage.clear();
    await imageStorage.clearAll();
    backups = TestBed.inject(BackupService);
    docs = TestBed.inject(DocumentManager);
    versions = TestBed.inject(VersionHistory);
  });

  it('keeps the page setup of each document', async () => {
    const stored = docWith('Pages');
    (stored.doc as any).attrs = { page: { layout: 'pages', paper: 'letter' } };
    const { meta } = await docs.createDoc('Pages', stored);
    const backup = await backups.create();
    await docs.clearAll();
    await backups.restore(throughFile(backups, backup), 'replace');
    expect(await docs.getDoc(meta.id)).toEqual(stored);
  });

  it('restores documents, version history and images exactly (replace)', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
    await imageStorage.putImage(
      { id: 'img_1', name: 'cat.png', type: 'image/png', size: png.size, createdAt: 7 },
      png,
    );
    const a = await docs.createDoc('A', docWith('Alpha', 'img_1'));
    const b = await docs.createDoc('B', docWith('Beta'));
    const named = await versions.snapshot(a.meta.id, docWith('Alpha draft'), 'named', 'Draft');
    const backup = await backups.create();

    await docs.clearAll();
    await imageStorage.clearAll();
    expect(await docs.getIndex()).toEqual([]);

    const summary = await backups.restore(throughFile(backups, backup), 'replace');
    expect(summary).toEqual({ added: 2, copies: 0, unchanged: 0, unreadable: 0 });

    const index = await docs.getIndex();
    expect(index.map((d) => d.id).sort()).toEqual([a.meta.id, b.meta.id].sort());
    expect(index.find((d) => d.id === a.meta.id)?.updatedAt).toBe(a.meta.updatedAt);
    expect(await docs.getDoc(a.meta.id)).toEqual(docWith('Alpha', 'img_1'));
    expect(await docs.getDoc(b.meta.id)).toEqual(docWith('Beta'));

    const restoredVersions = await versions.list(a.meta.id);
    expect(restoredVersions.map((v) => v.name)).toContain('Draft');
    expect(await versions.get(named.id)).toEqual(docWith('Alpha draft'));

    const image = await imageStorage.getImage('img_1');
    expect(image?.meta.name).toBe('cat.png');
    expect(new Uint8Array(await image!.blob.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    );
  });

  it('replace deletes documents that are not in the backup', async () => {
    await docs.createDoc('Kept', docWith('kept'));
    const backup = await backups.create();
    const extra = await docs.createDoc('Extra', docWith('extra'));

    await backups.restore(throughFile(backups, backup), 'replace');
    expect((await docs.getIndex()).map((d) => d.title)).toEqual(['Kept']);
    expect(await docs.getDoc(extra.meta.id)).toBeNull();
  });

  it('merge never overwrites: it adds missing documents and copies of changed ones', async () => {
    const a = await docs.createDoc('A', docWith('Alpha'));
    const b = await docs.createDoc('B', docWith('Beta'));
    const backup = await backups.create();

    await docs.deleteDoc(a.meta.id);
    await docs.saveDoc(b.meta.id, docWith('Beta, edited later'), 'B');
    const c = await docs.createDoc('C', docWith('Gamma'));

    const summary = await backups.restore(throughFile(backups, backup), 'merge');
    expect(summary).toEqual({ added: 1, copies: 1, unchanged: 0, unreadable: 0 });

    const index = await docs.getIndex();
    expect(index.map((d) => d.title).sort()).toEqual(['A', 'B', 'B (restored)', 'C']);
    expect(await docs.getDoc(a.meta.id)).toEqual(docWith('Alpha'));
    expect(await docs.getDoc(b.meta.id)).toEqual(docWith('Beta, edited later'));
    const copy = index.find((d) => d.title === 'B (restored)')!;
    expect(await docs.getDoc(copy.id)).toEqual(docWith('Beta'));
    expect(await docs.getDoc(c.meta.id)).toEqual(docWith('Gamma'));
  });

  it('merge skips documents identical to the ones on this device', async () => {
    await docs.createDoc('A', docWith('Alpha'));
    await docs.createDoc('B', docWith('Beta'));
    const backup = await backups.create();

    const summary = await backups.restore(throughFile(backups, backup), 'merge');
    expect(summary).toEqual({ added: 0, copies: 0, unchanged: 2, unreadable: 0 });
    expect(await docs.getIndex()).toHaveLength(2);
  });

  it('includes edits that storage refused, as they are in the editor', async () => {
    const a = await docs.createDoc('A', docWith('saved'));
    const unsaved = new Map([[a.meta.id, { title: 'A, renamed', doc: docWith('not saved yet') }]]);

    const backup = await backups.create(unsaved);
    expect(backup.documents).toHaveLength(1);
    expect(backup.documents[0].doc).toEqual(docWith('not saved yet'));
    expect(backup.documents[0].meta.title).toBe('A, renamed');
  });

  it('rejects files that are not backups, or from a newer Inkframe', () => {
    expect(() => backups.parse('not json')).toThrow(BackupError);
    expect(() => backups.parse('{"format":"something-else"}')).toThrow(/not an Inkframe backup/);
    expect(() =>
      backups.parse(JSON.stringify({ format: BACKUP_FORMAT, version: 99, documents: [] })),
    ).toThrow(/newer version/);
  });

  it('counts damaged documents and refuses to replace anything with an unreadable backup', async () => {
    await docs.createDoc('Mine', docWith('mine'));
    const parsed = backups.parse(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        createdAt: 1,
        documents: [
          { meta: { id: 'x' } },
          {
            meta: { id: 'future', title: 'Future', createdAt: 1, updatedAt: 1 },
            doc: { schemaVersion: SCHEMA_VERSION + 1, doc: { type: 'doc', content: [] } },
            versions: [],
          },
        ],
        images: [],
      }),
    );
    expect(parsed.damaged).toBe(1);

    await expect(backups.restore(parsed, 'replace')).rejects.toThrow(BackupError);
    // Nothing was deleted.
    expect((await docs.getIndex()).map((d) => d.title)).toEqual(['Mine']);
  });

  it('describes a restore for people', () => {
    expect(describeRestore({ added: 3, copies: 1, unchanged: 2, unreadable: 0 })).toBe(
      'Restored 4 documents, 1 as a copy. 2 documents already up to date.',
    );
    expect(describeRestore({ added: 0, copies: 0, unchanged: 1, unreadable: 1 })).toBe(
      'Nothing new to restore. 1 document already up to date. 1 document could not be read.',
    );
  });
});
