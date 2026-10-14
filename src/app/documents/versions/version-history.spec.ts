import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
import {
  LARGE_CHANGE_CHARS,
  SNAPSHOT_INTERVAL,
  VersionHistory,
  VersionMeta,
  retainedVersions,
} from './version-history';
import { readVersionContent, readVersionList } from './version-store';
import { DocumentManager } from '../document-manager';

const docWith = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 14, 12, 0).getTime();

const meta = (id: string, createdAt: number, extra: Partial<VersionMeta> = {}): VersionMeta => ({
  id,
  docId: 'd',
  createdAt,
  title: 'T',
  wordCount: 1,
  chars: 1,
  reason: 'auto',
  ...extra,
});

describe('retainedVersions', () => {
  it('keeps every automatic version from the last 24 hours', () => {
    const list = [meta('a', NOW - HOUR), meta('b', NOW - 2 * HOUR), meta('c', NOW - 23 * HOUR)];
    expect(retainedVersions(list, NOW)).toEqual(list);
  });

  it('keeps the newest automatic version of each older day, for 30 days', () => {
    const list = [
      meta('day2-late', NOW - 2 * DAY + HOUR),
      meta('day2-early', NOW - 2 * DAY - HOUR),
      meta('day5', NOW - 5 * DAY),
      meta('day31', NOW - 31 * DAY),
    ];
    expect(retainedVersions(list, NOW).map((v) => v.id)).toEqual(['day2-late', 'day5']);
  });

  it('keeps named versions however old they are', () => {
    const named = meta('named', NOW - 400 * DAY, { name: 'Final draft', reason: 'named' });
    expect(retainedVersions([named], NOW)).toEqual([named]);
  });
});

describe('VersionHistory', () => {
  let history: VersionHistory;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    history = new VersionHistory();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps the text from before the first edit', async () => {
    await history.recordEdit('d', docWith('original'), docWith('original, edited'));

    const list = await history.list('d');
    expect(list).toHaveLength(1);
    expect(await history.get(list[0].id)).toEqual(docWith('original'));
  });

  it('takes an automatic version at most every 10 minutes', async () => {
    await history.recordEdit('d', docWith('a'), docWith('ab'));
    await history.recordEdit('d', docWith('ab'), docWith('abc'));
    expect(await history.list('d')).toHaveLength(1);

    vi.setSystemTime(NOW + SNAPSHOT_INTERVAL);
    await history.recordEdit('d', docWith('abc'), docWith('abcd'));
    const list = await history.list('d');
    expect(list).toHaveLength(2);
    expect(await history.get(list[0].id)).toEqual(docWith('abcd'));
  });

  it('takes a version sooner when the text grows by 2,000 characters', async () => {
    await history.recordEdit('d', docWith('a'), docWith('ab'));
    const pasted = docWith('x'.repeat(LARGE_CHANGE_CHARS + 10));
    await history.recordEdit('d', docWith('ab'), pasted);

    const list = await history.list('d');
    expect(list).toHaveLength(2);
    expect(await history.get(list[0].id)).toEqual(pasted);
  });

  it('keeps the text from before a large deletion', async () => {
    const long = docWith('word '.repeat(200));
    await history.recordEdit('d', docWith('start'), long);
    vi.setSystemTime(NOW + 60_000);
    await history.recordEdit('d', long, docWith('word'));

    const [latest] = await history.list('d');
    expect(latest.reason).toBe('before-deletion');
    expect(await history.get(latest.id)).toEqual(long);
  });

  it('keeps named versions after automatic ones expire, and deletes expired content', async () => {
    const named = await history.snapshot('d', docWith('kept'), 'named', '  Final draft  ');
    const auto = await history.snapshot('d', docWith('expires'), 'auto');
    expect(named.name).toBe('Final draft');

    vi.setSystemTime(NOW + 40 * DAY);
    expect((await history.list('d')).map((v) => v.id)).toEqual([named.id]);
    expect(await readVersionContent(auto.id)).toBeNull();
    expect(await history.get(named.id)).toEqual(docWith('kept'));
  });

  it('remove() deletes one version and its content', async () => {
    const a = await history.snapshot('d', docWith('a'), 'auto');
    const b = await history.snapshot('d', docWith('b'), 'auto');
    await history.remove('d', a.id);
    expect((await history.list('d')).map((v) => v.id)).toEqual([b.id]);
    expect(await readVersionContent(a.id)).toBeNull();
  });

  it('runs concurrent writes for one document in order, losing none', async () => {
    await Promise.all([
      history.snapshot('d', docWith('1'), 'auto'),
      history.snapshot('d', docWith('2'), 'auto'),
      history.snapshot('d', docWith('3'), 'auto'),
    ]);
    expect(await history.list('d')).toHaveLength(3);
  });

  it('is removed with its document', async () => {
    const manager = new DocumentManager();
    const { meta: doc } = await manager.createDoc('A', docWith('a'));
    await manager.createDoc('B', docWith('b'));
    const version = await history.snapshot(doc.id, docWith('a'), 'named', 'Keep');

    await manager.deleteDoc(doc.id);
    expect(await readVersionList(doc.id)).toEqual([]);
    expect(await readVersionContent(version.id)).toBeNull();
  });
});
