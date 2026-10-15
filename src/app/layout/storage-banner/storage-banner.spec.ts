import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { imageStorage } from '@inkframe-ui/editor/core';
import { StorageBanner } from './storage-banner';
import { StorageHealth } from '@app/features/documents/data-access/storage-health';
import { BackupService } from '@app/features/documents/transfer/backup';

/** Makes the next document writes fail the way a full or blocked browser does. */
const refuseWrites = (name: string) =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('refused', name);
  });

async function render() {
  const fixture = TestBed.createComponent(StorageBanner);
  const health = TestBed.inject(StorageHealth);
  await health.checkMode();
  await fixture.whenStable();
  return { fixture, health, el: fixture.nativeElement as HTMLElement };
}

describe('StorageBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows "Storage is full" with Export backup when a save hits the quota', async () => {
    const { fixture, el } = await render();
    refuseWrites('QuotaExceededError');
    await imageStorage.saveDocument('inkframe_doc_x', { doc: {} }).catch(() => undefined);
    await fixture.whenStable();

    const banner = el.querySelector('.storage-banner')!;
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('Storage is full.');
    expect(el.querySelector('.banner-action')?.textContent).toContain('Export backup');
  });

  it('goes back to normal after a later save succeeds', async () => {
    const { fixture, el, health } = await render();
    const refused = refuseWrites('QuotaExceededError');
    await imageStorage.saveDocument('k', 1).catch(() => undefined);
    refused.mockRestore();
    await imageStorage.saveDocument('k', 2);
    await fixture.whenStable();

    // Without IndexedDB (as in this test) the normal state is "limited".
    expect(health.status()).toBe('limited');
    expect(el.textContent).not.toContain('Storage is full.');
  });

  it('downloads a backup that includes unsaved edits', async () => {
    const { fixture, el, health } = await render();
    const download = vi
      .spyOn(BackupService.prototype, 'download')
      .mockResolvedValue('inkframe-backup.inkframe.json');
    health.markUnsaved('doc_1', 'Draft', { schemaVersion: 4, doc: { type: 'doc' } });

    el.querySelector<HTMLButtonElement>('.banner-action')!.click();
    await vi.waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0][0]?.get('doc_1')?.title).toBe('Draft');
    await fixture.whenStable();
  });

  it('can be dismissed until the status changes', async () => {
    const { fixture, el, health } = await render();
    el.querySelector<HTMLButtonElement>('.banner-close')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.storage-banner')).toBeNull();

    refuseWrites('QuotaExceededError');
    await imageStorage.saveDocument('k', 1).catch(() => undefined);
    await fixture.whenStable();
    expect(health.status()).toBe('full');
    expect(el.querySelector('.storage-banner')).not.toBeNull();
  });
});
