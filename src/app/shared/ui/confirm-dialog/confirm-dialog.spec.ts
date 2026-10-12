import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmDialogService } from './confirm-dialog';

@Component({
  imports: [ConfirmDialogComponent],
  template: `<button type="button" class="opener">Delete</button><ink-confirm-dialog />`,
})
class Host {}

describe('ConfirmDialogComponent keyboard behavior', () => {
  async function open(isDestructive: boolean) {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const opener = el.querySelector<HTMLButtonElement>('.opener')!;
    opener.focus();
    const service = TestBed.inject(ConfirmDialogService);
    const answer = service.confirm({ title: 'Delete?', message: 'Gone for good.', isDestructive });
    await fixture.whenStable();
    return { fixture, el, opener, answer };
  }

  it('focuses Cancel for a destructive question, and Escape cancels and returns focus', async () => {
    const { fixture, el, opener, answer } = await open(true);
    expect(document.activeElement).toBe(el.querySelector('.ink-dialog-btn-cancel'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await answer).toBe(false);
    await fixture.whenStable();
    expect(el.querySelector('.ink-dialog-card')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog', async () => {
    const { el } = await open(false);
    const cancel = el.querySelector<HTMLButtonElement>('.ink-dialog-btn-cancel')!;
    const confirm = el.querySelector<HTMLButtonElement>('.ink-dialog-btn-confirm')!;
    expect(document.activeElement).toBe(confirm);

    const tab = (shiftKey: boolean) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
      );
    tab(false); // from the last button
    expect(document.activeElement).toBe(cancel);
    tab(true); // from the first button
    expect(document.activeElement).toBe(confirm);
  });

  it('a second question cancels the first instead of leaving it unanswered', async () => {
    const service = TestBed.inject(ConfirmDialogService);
    const first = service.confirm({ title: 'One?', message: '' });
    const second = service.confirm({ title: 'Two?', message: '' });
    expect(await first).toBe(false);
    service.close(true);
    expect(await second).toBe(true);
  });
});
