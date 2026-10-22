import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DocumentChannel, LibraryChange } from './document-channel';

/** A channel as one tab has it, with every change it heard. */
function tab() {
  const channel = TestBed.runInInjectionContext(() => new DocumentChannel());
  const heard: LibraryChange[] = [];
  channel.listen((change) => heard.push(change));
  return { channel, heard };
}

describe('DocumentChannel', () => {
  it("tells other tabs about changes, but not the tab's own", async () => {
    const one = tab();
    const two = tab();

    one.channel.post({ type: 'saved', ids: ['a'] });
    one.channel.post({ type: 'deleted', ids: ['b'] });
    await vi.waitFor(() => expect(two.heard).toHaveLength(2));

    expect(two.heard).toEqual([
      { type: 'saved', ids: ['a'] },
      { type: 'deleted', ids: ['b'] },
    ]);
    expect(one.heard).toEqual([]);
  });

  it('ignores messages it does not understand (from another version, say)', async () => {
    const listener = tab();
    const other = new BroadcastChannel('inkframe-library');
    other.postMessage({ type: 'saved', ids: 'a' });
    other.postMessage({ type: 'renamed', ids: ['a'] });
    other.postMessage({ type: 'cleared' });
    other.close();

    await vi.waitFor(() => expect(listener.heard).toEqual([{ type: 'cleared' }]));
  });

  it('closes when the app shuts down, and posting then does nothing', () => {
    const { channel } = tab();
    TestBed.resetTestingModule();
    expect(() => channel.post({ type: 'cleared' })).not.toThrow();
  });
});
