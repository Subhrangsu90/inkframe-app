import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentManager } from './document-manager';
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
