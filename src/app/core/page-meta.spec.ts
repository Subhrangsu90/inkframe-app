import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, TitleStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PageMetaStrategy } from './page-meta';

@Component({ template: '' })
class Blank {}

const content = (selector: string) =>
  [...document.head.querySelectorAll(selector)].map((el) => el.getAttribute('content'));

describe('PageMetaStrategy', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    document.head.querySelectorAll('meta, link[rel="canonical"]').forEach((el) => el.remove());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Blank, data: { meta: { index: true } } },
          { path: 'settings', title: 'Settings', component: Blank },
          { path: 'doc', component: Blank, data: { meta: { ownTitle: true } } },
        ]),
        { provide: TitleStrategy, useExisting: PageMetaStrategy },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('titles a page and keeps it out of search engines by default', async () => {
    await harness.navigateByUrl('/settings');
    expect(document.title).toBe('Settings · Inkframe');
    expect(content('meta[property="og:title"]')).toEqual(['Settings · Inkframe']);
    expect(content('meta[name="twitter:title"]')).toEqual(['Settings · Inkframe']);
    expect(content('meta[name="robots"]')).toEqual(['noindex']);
  });

  it('lets the home page be indexed under the site title, without duplicating tags', async () => {
    await harness.navigateByUrl('/settings');
    await harness.navigateByUrl('/');
    expect(document.title).toBe('Inkframe — Private WYSIWYG Document Editor');
    expect(content('meta[name="robots"]')).toEqual([]);
    expect(content('meta[name="description"]')).toHaveLength(1);
    expect(content('meta[property="og:title"]')).toHaveLength(1);
  });

  it('leaves the title to pages that name their own tab', async () => {
    await harness.navigateByUrl('/settings');
    TestBed.inject(PageMetaStrategy).setPageTitle('Launch plan');
    await harness.navigateByUrl('/doc');
    expect(document.title).toBe('Launch plan · Inkframe');
    expect(content('meta[name="robots"]')).toEqual(['noindex']);
  });

  it('falls back to the site title for an empty page title', () => {
    TestBed.inject(PageMetaStrategy).setPageTitle('   ');
    expect(document.title).toBe('Inkframe — Private WYSIWYG Document Editor');
  });
});
