import { describe, expect, it } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InkAvatar } from './avatar';

@Component({
  imports: [InkAvatar],
  template: `<ink-avatar [name]="name()" [src]="src()" [size]="36" />`,
})
class Host {
  readonly name = signal('ada');
  readonly src = signal<string | null>(null);
}

async function render(src: string | null, name = 'ada') {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.src.set(src);
  fixture.componentInstance.name.set(name);
  await fixture.whenStable();
  const avatar = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('ink-avatar')!;
  return { fixture, avatar };
}

describe('InkAvatar', () => {
  it("shows the name's first letter when there is no photo", async () => {
    const { avatar } = await render(null);
    expect(avatar.textContent!.trim()).toBe('A');
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
    expect(avatar.style.width).toBe('36px');
  });

  it('shows the photo without telling its host which page shows it', async () => {
    const { avatar } = await render('https://lh3.googleusercontent.com/a/photo');
    const img = avatar.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('alt')).toBe('');
  });

  it("falls back to the letter when the photo doesn't load, and tries a new one", async () => {
    const { fixture, avatar } = await render('https://lh3.googleusercontent.com/a/broken');
    avatar.querySelector('img')!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.textContent!.trim()).toBe('A');

    fixture.componentInstance.src.set('https://lh3.googleusercontent.com/a/new');
    await fixture.whenStable();
    expect(avatar.querySelector('img')).not.toBeNull();
  });

  it('shows a question mark without a name', async () => {
    const { avatar } = await render(null, '  ');
    expect(avatar.textContent!.trim()).toBe('?');
  });
});
