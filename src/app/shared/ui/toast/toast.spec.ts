import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastService } from './toast';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog';

describe('ToastService (Phase 1 Shared UI Foundation)', () => {
  let toastService: ToastService;

  beforeEach(() => {
    toastService = new ToastService();
  });

  it('initializes with an empty toast list', () => {
    expect(toastService.toasts()).toEqual([]);
  });

  it('dispatches a success toast message correctly', () => {
    const id = toastService.success('Document saved successfully');
    const toasts = toastService.toasts();

    expect(toasts.length).toBe(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].message).toBe('Document saved successfully');
    expect(toasts[0].type).toBe('success');
  });

  it('dispatches error, info, and warning toasts', () => {
    toastService.error('Failed to export markdown');
    toastService.info('Switched to Dark theme');
    toastService.warning('Storage quota near limit');

    const toasts = toastService.toasts();
    expect(toasts.length).toBe(3);
    expect(toasts[0].type).toBe('error');
    expect(toasts[1].type).toBe('info');
    expect(toasts[2].type).toBe('warning');
  });

  it('dismisses a specific toast by id', () => {
    const id1 = toastService.info('Message 1');
    const id2 = toastService.info('Message 2');

    expect(toastService.toasts().length).toBe(2);

    toastService.dismiss(id1);
    const toasts = toastService.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].id).toBe(id2);
  });

  it('clears all active toasts', () => {
    toastService.info('Message 1');
    toastService.info('Message 2');
    toastService.clear();

    expect(toastService.toasts().length).toBe(0);
  });

  it('auto-dismisses toast when duration timer expires', async () => {
    vi.useFakeTimers();

    toastService.show('Auto expiring notification', 'info', 1000);
    expect(toastService.toasts().length).toBe(1);

    vi.advanceTimersByTime(1100);
    expect(toastService.toasts().length).toBe(0);

    vi.useRealTimers();
  });

  it('supports toast action triggers', () => {
    let actionExecuted = false;
    toastService.success('Deleted note', 3000, {
      label: 'Undo',
      onClick: () => {
        actionExecuted = true;
      },
    });

    const current = toastService.toasts()[0];
    expect(current.action).toBeDefined();
    expect(current.action?.label).toBe('Undo');

    current.action?.onClick();
    expect(actionExecuted).toBe(true);
  });
});

describe('ConfirmDialogService (Phase 1 Shared UI Foundation)', () => {
  let confirmService: ConfirmDialogService;

  beforeEach(() => {
    confirmService = new ConfirmDialogService();
  });

  it('opens dialog with options and resolves promise on confirmation', async () => {
    const promise = confirmService.confirm({
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document?',
      isDestructive: true,
      confirmText: 'Delete',
    });

    expect(confirmService.state()).not.toBeNull();
    expect(confirmService.state()?.options.title).toBe('Delete Document');
    expect(confirmService.state()?.options.isDestructive).toBe(true);

    confirmService.close(true);
    const result = await promise;
    expect(result).toBe(true);
    expect(confirmService.state()).toBeNull();
  });

  it('resolves false on cancellation', async () => {
    const promise = confirmService.confirm({
      title: 'Discard Changes',
      message: 'Unsaved edits will be lost.',
    });

    confirmService.close(false);
    const result = await promise;
    expect(result).toBe(false);
    expect(confirmService.state()).toBeNull();
  });
});
