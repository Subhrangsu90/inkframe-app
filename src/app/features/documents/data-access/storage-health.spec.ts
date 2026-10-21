import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BACKUP_REMINDER_DAYS, StorageHealth, backupReminderDue } from './storage-health';
import type { DocMeta } from './document-store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const doc = (createdAt: number, updatedAt: number): DocMeta => ({
  id: `doc_${createdAt}_${updatedAt}`,
  title: 'Notes',
  wordCount: 1,
  createdAt,
  updatedAt,
});

describe('backupReminderDue', () => {
  const due = (docs: DocMeta[], lastBackup: number | null = null, closed: number | null = null) =>
    backupReminderDue(docs, lastBackup, closed, NOW);
  const written = doc(NOW - 60 * DAY, NOW - DAY);

  it('waits until someone has been writing for two weeks', () => {
    expect(due([doc(NOW - 13 * DAY, NOW - DAY)])).toBe(false);
    expect(due([doc(NOW - BACKUP_REMINDER_DAYS * DAY, NOW - DAY)])).toBe(true);
  });

  it('leaves out documents nobody wrote in, such as the welcome document', () => {
    expect(due([doc(NOW - 60 * DAY, NOW - 60 * DAY)])).toBe(false);
    expect(due([])).toBe(false);
  });

  it('comes back two weeks after a backup, when something was written since', () => {
    const backup = NOW - 20 * DAY;
    expect(due([doc(NOW - 60 * DAY, backup - DAY)], backup)).toBe(false);
    expect(due([written], NOW - 13 * DAY)).toBe(false);
    expect(due([written], backup)).toBe(true);
  });

  it('stays closed for two weeks', () => {
    expect(due([written], null, NOW - 13 * DAY)).toBe(false);
    expect(due([written], null, NOW - BACKUP_REMINDER_DAYS * DAY)).toBe(true);
  });
});

describe('StorageHealth', () => {
  afterEach(() => {
    delete (navigator as any).storage;
    localStorage.clear();
  });

  it('asks the browser, once a visit and after a save, to keep documents', async () => {
    const persist = vi.fn(async () => true);
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted: async () => false },
    });
    const health = TestBed.inject(StorageHealth);
    await vi.waitFor(() => expect(health.persisted()).toBe(false));
    expect(persist).not.toHaveBeenCalled();

    health.markSaved('a');
    health.markSaved('b');
    await vi.waitFor(() => expect(health.persisted()).toBe(true));
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('remembers the last backup between visits, and never moves it back', () => {
    const health = TestBed.inject(StorageHealth);
    health.recordBackup(5000);
    health.recordBackup(4000); // an older backup, restored
    expect(health.lastBackup()).toBe(5000);

    TestBed.resetTestingModule();
    expect(TestBed.inject(StorageHealth).lastBackup()).toBe(5000);
  });
});
