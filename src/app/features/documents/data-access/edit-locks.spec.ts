import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EditAccess, EditLocks, LOCK_MANAGER } from './edit-locks';

// Node's Web Locks (jsdom has none): the same rules as browsers', shared by
// everything in this process, so each EditLocks below acts as one tab.
const nodeLocks = (globalThis as any).process.getBuiltinModule('node:worker_threads').locks;

let docCount = 0;
/** A document id no other test uses: locks outlive a test. */
const newDocId = () => `doc_locks_${++docCount}`;

/** A tab with the document open, and every access it was told about. */
async function openIn(docId: string) {
  const heard: EditAccess[] = [];
  const locks = TestBed.runInInjectionContext(() => new EditLocks());
  const lock = await locks.open(docId, (access) => heard.push(access));
  return { heard, lock, last: () => heard[heard.length - 1] };
}

describe('EditLocks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCK_MANAGER, useValue: nodeLocks }] });
  });

  it('lets the first tab edit and shows the document read-only in the next', async () => {
    const id = newDocId();
    const first = await openIn(id);
    const second = await openIn(id);

    expect(first.heard).toEqual(['edit']);
    expect(second.heard).toEqual(['elsewhere']);
    first.lock.release();
    second.lock.release();
  });

  it('hands the document to the waiting tab when the editing tab lets it go', async () => {
    const id = newDocId();
    const first = await openIn(id);
    const second = await openIn(id);

    first.lock.release();
    await vi.waitFor(() => expect(second.last()).toBe('edit'));
    expect(first.heard).toEqual(['edit']); // nothing after release
    second.lock.release();
  });

  it('"Edit here" takes it over, and the first tab gets it back once that tab closes it', async () => {
    const id = newDocId();
    const first = await openIn(id);
    const second = await openIn(id);

    second.lock.takeOver();
    await vi.waitFor(() => expect(second.last()).toBe('edit'));
    await vi.waitFor(() => expect(first.last()).toBe('elsewhere'));

    second.lock.release();
    await vi.waitFor(() => expect(first.last()).toBe('edit'));
    expect(first.heard).toEqual(['edit', 'elsewhere', 'edit']);
    expect(second.heard).toEqual(['elsewhere', 'edit']);
    first.lock.release();
  });

  it('lets one tab edit at a time, even with three', async () => {
    const id = newDocId();
    const tabs = [await openIn(id), await openIn(id), await openIn(id)];
    const editing = () => tabs.filter((tab) => tab.last() === 'edit').length;
    expect(editing()).toBe(1);

    tabs[2].lock.takeOver();
    await vi.waitFor(() => expect(tabs[2].last()).toBe('edit'));
    await vi.waitFor(() => expect(tabs[0].last()).toBe('elsewhere'));
    expect(editing()).toBe(1);

    tabs[2].lock.release();
    await vi.waitFor(() => expect(editing()).toBe(1));
    tabs.forEach((tab) => tab.lock.release());
  });

  it('lets every tab edit without Web Locks, as before', async () => {
    TestBed.overrideProvider(LOCK_MANAGER, { useValue: null });
    const id = newDocId();
    const first = await openIn(id);
    const second = await openIn(id);
    expect(first.heard).toEqual(['edit']);
    expect(second.heard).toEqual(['edit']);
  });
});
