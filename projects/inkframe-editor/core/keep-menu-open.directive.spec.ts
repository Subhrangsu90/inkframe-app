import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeepMenuOpen } from './keep-menu-open.directive';

@Component({
  imports: [KeepMenuOpen],
  template: `
    <div class="panel">
      <div inkKeepMenuOpen><button type="button" class="inside">Pick</button></div>
      <button type="button" class="outside">Close</button>
    </div>
  `,
})
class Host {}

describe('KeepMenuOpen', () => {
  it('stops clicks on the content from reaching the menu panel, and only those', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    // Stands in for the click listener that closes a mat-menu panel.
    let panelClicks = 0;
    el.querySelector('.panel')!.addEventListener('click', () => panelClicks++);

    el.querySelector<HTMLButtonElement>('.inside')!.click();
    expect(panelClicks).toBe(0);

    el.querySelector<HTMLButtonElement>('.outside')!.click();
    expect(panelClicks).toBe(1);
  });
});
