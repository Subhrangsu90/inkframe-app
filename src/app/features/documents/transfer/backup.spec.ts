import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SCHEMA_VERSION, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { BACKUP_FORMAT, BackupError, BackupService, UnsavedDoc, describeRestore } from './backup';
import { DocumentManager } from '../data-access/document-manager';
import { StorageHealth } from '../data-access/storage-health';
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

/** Makes a backup file and reads it back, as restoring from it does. */
const throughFile = async (service: BackupService, unsaved?: Map<string, UnsavedDoc>) =>
  service.parse((await service.createFile(unsaved)).file);

/** The lines of a backup file. */
const linesOf = async (service: BackupService) =>
  (await (await service.createFile()).file.text()).split('\n');

const pngOf = (bytes: number[] | Uint8Array) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/png' });

const putPng = (id: string, png: Blob) =>
  imageStorage.putImage(
    { id, name: `${id}.png`, type: 'image/png', size: png.size, createdAt: 7 },
    png,
  );

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
    const backup = await throughFile(backups);
    await docs.clearAll();
    await backups.restore(backup, 'replace');
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
    const backup = await throughFile(backups);

    await docs.clearAll();
    await imageStorage.clearAll();
    expect(await docs.getIndex()).toEqual([]);

    const summary = await backups.restore(backup, 'replace');
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

  it('counts a replace restore as a backup for the reminder, but not a merge', async () => {
    await docs.createDoc('A', docWith('Alpha'));
    const backup = { ...(await throughFile(backups)), createdAt: 5000 };
    const health = TestBed.inject(StorageHealth);

    await backups.restore(backup, 'merge');
    expect(health.lastBackup()).toBeNull();
    await backups.restore(backup, 'replace');
    expect(health.lastBackup()).toBe(5000);
  });

  it('replace deletes documents that are not in the backup', async () => {
    await docs.createDoc('Kept', docWith('kept'));
    const backup = await throughFile(backups);
    const extra = await docs.createDoc('Extra', docWith('extra'));

    await backups.restore(backup, 'replace');
    expect((await docs.getIndex()).map((d) => d.title)).toEqual(['Kept']);
    expect(await docs.getDoc(extra.meta.id)).toBeNull();
  });

  it('merge never overwrites: it adds missing documents and copies of changed ones', async () => {
    const a = await docs.createDoc('A', docWith('Alpha'));
    const b = await docs.createDoc('B', docWith('Beta'));
    const backup = await throughFile(backups);

    await docs.deleteDoc(a.meta.id);
    await docs.saveDoc(b.meta.id, docWith('Beta, edited later'), 'B');
    const c = await docs.createDoc('C', docWith('Gamma'));

    const summary = await backups.restore(backup, 'merge');
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
    const backup = await throughFile(backups);

    const summary = await backups.restore(backup, 'merge');
    expect(summary).toEqual({ added: 0, copies: 0, unchanged: 2, unreadable: 0 });
    expect(await docs.getIndex()).toHaveLength(2);
  });

  it('includes edits that storage refused, as they are in the editor', async () => {
    const a = await docs.createDoc('A', docWith('saved'));
    const unsaved = new Map([[a.meta.id, { title: 'A, renamed', doc: docWith('not saved yet') }]]);

    const backup = await throughFile(backups, unsaved);
    expect(backup.documents).toHaveLength(1);
    expect(backup.documents[0].doc).toEqual(docWith('not saved yet'));
    expect(backup.documents[0].meta.title).toBe('A, renamed');
  });

  it('writes each document and image on a line of its own, as plain JSON', async () => {
    await putPng('img_1', pngOf([137, 80, 78, 71]));
    await docs.createDoc('A', docWith('Alpha', 'img_1'));
    await docs.createDoc('B', docWith('Beta'));
    const lines = await linesOf(backups);

    expect(lines[0]).toMatch(
      /^\{"format":"inkframe-backup","version":1,"createdAt":\d+,"documents":\[$/,
    );
    expect(
      lines
        .slice(1, 3)
        .map((line) => JSON.parse(line.replace(/,$/, '')).meta.title)
        .sort(),
    ).toEqual(['A', 'B']);
    expect(lines[3]).toBe('],"images":[');
    expect(JSON.parse(lines[4]).id).toBe('img_1');
    expect(lines.slice(5)).toEqual([']}', '']);
    // One JSON document all the same, which Inkframe before this layout reads.
    const whole = JSON.parse(lines.join('\n'));
    expect(whole.documents).toHaveLength(2);
    expect(whole.images).toHaveLength(1);
  });

  it('restores backups written as one line, as Inkframe made them before', async () => {
    await putPng('img_1', pngOf([137, 80, 78, 71]));
    const a = await docs.createDoc('A', docWith('Alpha', 'img_1'));
    const oneLine = JSON.stringify(JSON.parse((await linesOf(backups)).join('\n')));
    await docs.clearAll();
    await imageStorage.clearAll();

    const summary = await backups.restore(await backups.parse(new Blob([oneLine])), 'replace');
    expect(summary.added).toBe(1);
    expect(await docs.getDoc(a.meta.id)).toEqual(docWith('Alpha', 'img_1'));
    expect((await imageStorage.getImage('img_1'))?.blob.size).toBe(4);
  });

  it('restores an image longer than one read of the file', async () => {
    // Bytes that do not compress, about 2 MB as text: it spans three reads.
    const bytes = new Uint8Array(1_500_000).map((_, i) => (i * 7919) % 251);
    await putPng('big', pngOf(bytes));
    await docs.createDoc('Photo', docWith('Photo', 'big'));
    const backup = await throughFile(backups);
    await imageStorage.clearAll();

    await backups.restore(backup, 'replace');
    const restored = new Uint8Array(await (await imageStorage.getImage('big'))!.blob.arrayBuffer());
    // Compared by hand: toEqual takes seconds over this many bytes.
    expect(restored.length === bytes.length && restored.every((b, i) => b === bytes[i])).toBe(true);
  });

  it('restores the rest of a file with a damaged line', async () => {
    await putPng('img_1', pngOf([1]));
    await putPng('img_2', pngOf([2]));
    await docs.createDoc('A', docWith('Alpha', 'img_1'));
    await docs.createDoc('B', docWith('Beta', 'img_2'));
    const lines = await linesOf(backups);
    const brokenDoc = lines.findIndex((line) => line.includes('"Beta"'));
    lines[brokenDoc] = lines[brokenDoc].slice(0, 30);
    const brokenImage = lines.findIndex((line) => line.startsWith('{"id":"img_1"'));
    lines[brokenImage] = '{"id":"img_1","data":"data:image/png;base64,AQ';
    await docs.clearAll();
    await imageStorage.clearAll();

    const parsed = await backups.parse(new Blob([lines.join('\n')]));
    expect(parsed.damaged).toBe(1);
    expect(parsed.documents.map((d) => d.meta.title)).toEqual(['A']);
    const summary = await backups.restore(parsed, 'replace');
    expect(summary).toEqual({ added: 1, copies: 0, unchanged: 0, unreadable: 1 });
    expect(await imageStorage.getImage('img_1')).toBeNull();
  });

  it('reads an empty library, and files edited to end their lines with CR LF', async () => {
    const empty = await throughFile(backups);
    expect(empty.documents).toEqual([]);
    expect(empty.damaged).toBe(0);

    await docs.createDoc('A', docWith('Alpha'));
    const windows = (await linesOf(backups)).join('\r\n');
    expect((await backups.parse(new Blob([windows]))).documents).toHaveLength(1);
  });

  it('rejects files that are not backups, or from a newer Inkframe', async () => {
    const parse = (text: string) => backups.parse(new Blob([text]));
    await expect(parse('not json')).rejects.toThrow(BackupError);
    await expect(parse('{"format":"something-else"}')).rejects.toThrow(/not an Inkframe backup/);
    await expect(
      parse(JSON.stringify({ format: BACKUP_FORMAT, version: 99, documents: [] })),
    ).rejects.toThrow(/newer version/);
    await expect(
      parse(
        `{"format":"${BACKUP_FORMAT}","version":99,"createdAt":1,"documents":[\n],"images":[\n]}`,
      ),
    ).rejects.toThrow(/newer version/);
  });

  it('counts damaged documents and refuses to replace anything with an unreadable backup', async () => {
    await docs.createDoc('Mine', docWith('mine'));
    const parsed = await backups.parse(
      new Blob([
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
      ]),
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
