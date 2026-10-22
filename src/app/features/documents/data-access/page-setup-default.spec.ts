import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_PAGE_SETUP, PageSetup, SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
import {
  PageSetupDefaults,
  readDefaultPageSetup,
  withDefaultPageSetup,
} from './page-setup-default';
import { DocumentManager } from './document-manager';

const a4Pages: PageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'pages', paper: 'a4' };

const docWith = (text: string, page?: unknown): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: {
    type: 'doc',
    ...(page === undefined ? {} : { attrs: { page } }),
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  },
});

const pageOf = (stored: StoredDoc | null) => (stored?.doc as any)?.attrs?.page ?? null;

describe('default page setup', () => {
  beforeEach(() => localStorage.clear());

  it('is saved by PageSetupDefaults and read back', () => {
    const defaults = TestBed.inject(PageSetupDefaults);
    expect(defaults.value()).toBeNull();
    defaults.save(a4Pages);
    expect(defaults.value()).toEqual(a4Pages);
    expect(readDefaultPageSetup()).toEqual(a4Pages);
    defaults.save(null);
    expect(readDefaultPageSetup()).toBeNull();
  });

  it('ignores a damaged saved value', () => {
    localStorage.setItem('inkframe-page-setup', '{not json');
    expect(readDefaultPageSetup()).toBeNull();
    localStorage.setItem('inkframe-page-setup', '"pages"');
    expect(readDefaultPageSetup()).toBeNull();
  });

  it('is added to documents without a page setup of their own', () => {
    expect(withDefaultPageSetup(docWith('a'))).toEqual(docWith('a'));
    TestBed.inject(PageSetupDefaults).save(a4Pages);
    expect(pageOf(withDefaultPageSetup(docWith('a')))).toEqual(a4Pages);
    const own = { ...a4Pages, paper: 'letter' };
    expect(pageOf(withDefaultPageSetup(docWith('a', own)))).toEqual(own);
  });

  it('applies to new blank documents, templates and imports, but not to copies', async () => {
    TestBed.inject(PageSetupDefaults).save(a4Pages);
    const manager = TestBed.inject(DocumentManager);

    const blank = await manager.createDoc('Blank');
    expect(pageOf(blank.doc)).toEqual(a4Pages);

    const template = await manager.createDoc('Template', docWith('t'), { defaultPageSetup: true });
    expect(pageOf(template.doc)).toEqual(a4Pages);

    const copy = await manager.createDoc('Copy', docWith('c'));
    expect(pageOf(copy.doc)).toBeNull();
    expect(pageOf(await manager.getDoc(copy.meta.id))).toBeNull();
  });
});
