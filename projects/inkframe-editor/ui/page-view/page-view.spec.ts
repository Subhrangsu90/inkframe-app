import { describe, it, expect } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_PAGE_SETUP } from '@inkframe-ui/editor/core';
import { PageFrames, PageView } from './page-view';

@Component({
  imports: [PageFrames, PageView],
  template: `
    <ink-page-frames [pages]="pages()" />
    <div [innerHTML]="html" [inkPageView]="setup" (pageCount)="counts.push($event)"></div>
  `,
})
class Host {
  readonly pages = signal(3);
  readonly setup = DEFAULT_PAGE_SETUP;
  readonly html = '<p>Text</p>';
  readonly counts: number[] = [];
}

describe('page view components', () => {
  it('draws a sheet and a label per page, hidden from screen readers', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const frames = fixture.nativeElement.querySelector('ink-page-frames') as HTMLElement;
    expect(frames.classList).toContain('ink-page-frames');
    expect(frames.getAttribute('aria-hidden')).toBe('true');
    const labels = Array.from(frames.querySelectorAll('.ink-page-label')).map((l) =>
      l.textContent!.trim(),
    );
    expect(labels).toEqual(['Page 1 of 3', 'Page 2 of 3', 'Page 3 of 3']);
    const tops = Array.from(frames.querySelectorAll<HTMLElement>('.ink-page-frame')).map(
      (f) => f.style.top,
    );
    expect(tops[0]).toContain('* 0');
    expect(tops[2]).toContain('* 2');

    fixture.componentInstance.pages.set(1);
    await fixture.whenStable();
    expect(frames.querySelectorAll('.ink-page-frame').length).toBe(1);
  });

  it('reports no pages for a Pageless document', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve));
    expect(fixture.componentInstance.counts).toEqual([0]);
  });
});
