import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SCHEMA_VERSION, StoredDoc, imageStorage } from '@inkframe-ui/editor/core';
import { ImageCleanup } from './image-cleanup';
import { StorageHealth } from './storage-health';
import { DocumentManager } from './document-manager';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const showing = (id: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: `ink-idb:${id}` } }] }],
  },
});

describe('ImageCleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const deleteUnused = () => vi.spyOn(imageStorage, 'deleteUnusedImages').mockResolvedValue(0);

  it("deletes a deleted document's unused images a little later, keeping those unsaved edits show", () => {
    vi.useFakeTimers();
    localStorage.setItem('inkframe-image-sweep', String(Date.now())); // no weekly sweep due
    const run = deleteUnused();
    const cleanup = TestBed.inject(ImageCleanup);
    TestBed.inject(StorageHealth).markUnsaved('b', 'B', showing('in-unsaved-edit'));

    cleanup.afterDeleting(showing('one'));
    cleanup.afterDeleting(showing('two'));
    vi.advanceTimersByTime(14_000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      onlyFrom: [showing('one'), showing('two')],
      minAgeMs: HOUR,
      alsoUsedBy: [showing('in-unsaved-edit')],
    });
  });

  it('sweeps the whole library a minute after start, once a week', () => {
    vi.useFakeTimers();
    const run = deleteUnused();
    localStorage.setItem('inkframe-image-sweep', String(Date.now() - 8 * DAY));
    TestBed.inject(ImageCleanup);
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledWith({ minAgeMs: DAY, alsoUsedBy: [] });
    expect(Number(localStorage.getItem('inkframe-image-sweep'))).toBe(Date.now());

    // The next start, the same week: no sweep.
    TestBed.resetTestingModule();
    run.mockClear();
    TestBed.inject(ImageCleanup);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('waits while a restore writes images before the documents that show them', async () => {
    localStorage.setItem('inkframe-image-sweep', String(Date.now())); // no weekly sweep due
    const run = deleteUnused();
    const cleanup = TestBed.inject(ImageCleanup);
    let finish!: () => void;
    const restoring = cleanup.hold(() => new Promise<void>((resolve) => (finish = resolve)));

    const sweeping = cleanup.sweep();
    await new Promise((resolve) => setTimeout(resolve));
    expect(run).not.toHaveBeenCalled();
    finish();
    await restoring;
    await sweeping;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is told about every deleted document, with its content', async () => {
    const afterDeleting = vi.spyOn(ImageCleanup.prototype, 'afterDeleting').mockReturnValue();
    const docs = TestBed.inject(DocumentManager);
    const { meta } = await docs.createDoc('Photo', showing('photo'));
    await docs.createDoc('Other', showing('other'));

    await docs.deleteDoc(meta.id);
    expect(afterDeleting).toHaveBeenCalledWith(showing('photo'));
  });
});
