import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentManager, extractDocExcerpt } from './document-manager';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';

const docWith = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

// jsdom has no IndexedDB, so storage falls back to localStorage here.
describe('DocumentManager persistence', () => {
  let manager: DocumentManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new DocumentManager();
  });

  it('deleteDoc removes the stored content, not just the index entry', async () => {
    const a = await manager.createDoc('A', docWith('secret A'));
    await manager.createDoc('B', docWith('B'));

    await manager.deleteDoc(a.meta.id);

    expect(await manager.getDoc(a.meta.id)).toBeNull();
    expect(localStorage.getItem(`inkframe_doc_${a.meta.id}`)).toBeNull();
    expect((await manager.getIndex()).map((d) => d.id)).not.toContain(a.meta.id);
  });

  it('deleting the last document leaves only the new welcome document in the index', async () => {
    const only = await manager.createDoc('Only', docWith('only'));
    const nextId = await manager.deleteDoc(only.meta.id);

    const index = await manager.getIndex();
    expect(index.map((d) => d.id)).toEqual([nextId]);
    expect(nextId).not.toBe(only.meta.id);
  });

  it('saves no longer mirror every document into the legacy key', async () => {
    await manager.createDoc('A', docWith('A'));
    expect(localStorage.getItem('inkframe_saved_doc')).toBeNull();
  });

  it('migrates a legacy document once, then removes the stale legacy copy', async () => {
    localStorage.setItem('inkframe_saved_doc', JSON.stringify(docWith('legacy text')));

    const index = await manager.getIndex();
    expect(index.map((d) => d.id)).toEqual(['doc_default']);
    expect((await manager.getDoc('doc_default'))?.doc).toEqual(docWith('legacy text').doc);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    expect(localStorage.getItem('inkframe_saved_doc')).toBeNull();
  });
});

describe('DocumentManager.clearAll', () => {
  beforeEach(() => localStorage.clear());

  it('removes every document but keeps preferences', async () => {
    const manager = new DocumentManager();
    await manager.createDoc('A', docWith('A'));
    localStorage.setItem('inkframe-theme', 'light');
    localStorage.setItem('inkframe_sidebar_collapsed', 'true');

    await manager.clearAll();

    expect(await manager.getIndex()).toEqual([]);
    const remaining = Object.keys(localStorage);
    expect(remaining.sort()).toEqual(['inkframe-theme', 'inkframe_sidebar_collapsed']);
  });
});

describe('document previews', () => {
  const doc = (...content: any[]): StoredDoc => ({ schemaVersion: SCHEMA_VERSION, doc: { type: 'doc', content } });
  const p = (...runs: any[]) => ({ type: 'paragraph', content: runs });
  const h1 = (text: string) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] });

  it('skips the title heading and joins text runs and blocks naturally', () => {
    const stored = doc(
      h1('Plan'),
      p({ type: 'text', text: 'Ship ' }, { type: 'text', text: 'bold', marks: [{ type: 'strong' }] }, { type: 'text', text: 'ly.' }),
      { type: 'bullet_list', content: [{ type: 'list_item', content: [p({ type: 'text', text: 'First' })] }] },
    );
    expect(extractDocExcerpt(stored, 'Plan')).toBe('Ship boldly. First');
  });

  it('keeps a leading heading that is not the title', () => {
    expect(extractDocExcerpt(doc(h1('Intro'), p({ type: 'text', text: 'Body' })), 'Other')).toBe('Intro Body');
  });

  it('shortens long text at a word boundary', () => {
    const excerpt = extractDocExcerpt(doc(p({ type: 'text', text: 'word '.repeat(100) })), '', 23);
    expect(excerpt).toBe('word word word word…');
  });

  it('is saved with the document and backfilled for older index entries', async () => {
    localStorage.clear();
    const manager = new DocumentManager();
    const { meta } = await manager.createDoc('Notes', docWith('Remember the milk'));
    expect(meta.excerpt).toBe('Remember the milk');

    const index = await manager.getIndex();
    delete index[0].excerpt;
    await manager.saveIndex(index);
    const before = index[0].updatedAt;

    expect(await manager.backfillExcerpts()).toBe(true);
    const [entry] = await manager.getIndex();
    expect(entry.excerpt).toBe('Remember the milk');
    expect(entry.updatedAt).toBe(before);
    expect(await manager.backfillExcerpts()).toBe(false);
  });
});
