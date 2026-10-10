import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DocumentManager,
  extractDocTitle,
  extractDocWordCount,
  formatRelativeTime,
} from './core/document-manager';
import { WELCOME_DOC } from './core/welcome-doc';
import { routes } from './app.routes';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';

describe('Document Metadata & Extraction Utilities', () => {
  it('extracts title correctly from heading node', () => {
    const doc: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'My Custom Architecture Plan' }],
          },
        ],
      },
    };
    expect(extractDocTitle(doc)).toBe('My Custom Architecture Plan');
  });

  it('falls back to paragraph if heading is missing', () => {
    const doc: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A quick introduction paragraph' }],
          },
        ],
      },
    };
    expect(extractDocTitle(doc)).toBe('A quick introduction paragraph');
  });

  it('returns Untitled Document for empty content', () => {
    const doc: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [],
      },
    };
    expect(extractDocTitle(doc)).toBe('Untitled Document');
  });

  it('calculates word count accurately across nested blocks', () => {
    const doc: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            content: [{ type: 'text', text: 'Inkframe Architecture' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'One two three four five' }],
          },
        ],
      },
    };
    expect(extractDocWordCount(doc)).toBe(7);
  });

  it('formats relative timestamps accurately', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10 * 1000)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60 * 1000)).toBe('5m ago');
    expect(formatRelativeTime(now - 2 * 3600 * 1000)).toBe('2h ago');
    expect(formatRelativeTime(now - 25 * 3600 * 1000)).toBe('Yesterday');
  });
});

describe('Welcome Document Seed', () => {
  it('matches valid editor schema version', () => {
    expect(WELCOME_DOC.schemaVersion).toBe(SCHEMA_VERSION);
    expect(WELCOME_DOC.doc).toBeDefined();
    expect((WELCOME_DOC.doc as any).type).toBe('doc');
    expect(Array.isArray((WELCOME_DOC.doc as any).content)).toBe(true);
  });

  it('has a valid title and word count', () => {
    const title = extractDocTitle(WELCOME_DOC);
    expect(title).toContain('Inkframe');
    expect(extractDocWordCount(WELCOME_DOC)).toBeGreaterThan(50);
  });
});

describe('DocumentManager Service', () => {
  let manager: DocumentManager;

  beforeEach(() => {
    localStorage.clear();
    manager = new DocumentManager();
  });

  it('initializes document manager instance', () => {
    expect(manager).toBeDefined();
  });

  it('generates a new unique document ID and seeds it', async () => {
    const res = await manager.createDoc('Initial Document');
    expect(res.meta.id).toMatch(/^doc_/);
    expect(res.meta.title).toBe('Initial Document');
    expect(res.doc).toBeDefined();

    const activeId = manager.getActiveDocId();
    expect(activeId).toBe(res.meta.id);
  });

  it('persists and updates document index', async () => {
    const docContent: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Test Persisted Title' }],
          },
        ],
      },
    };

    const meta = await manager.saveDoc('doc_unit_1', docContent);
    expect(meta.id).toBe('doc_unit_1');
    expect(meta.title).toBe('Test Persisted Title');

    const index = await manager.getIndex();
    expect(index.some((d) => d.id === 'doc_unit_1')).toBe(true);
  });

  it('deletes document and updates index', async () => {
    const docContent: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: { type: 'doc', content: [] },
    };
    await manager.saveDoc('doc_to_delete', docContent, 'To Delete');
    let index = await manager.getIndex();
    expect(index.some((d) => d.id === 'doc_to_delete')).toBe(true);

    await manager.deleteDoc('doc_to_delete');
    index = await manager.getIndex();
    expect(index.some((d) => d.id === 'doc_to_delete')).toBe(false);
  });
});

describe('Application Route Definitions', () => {
  it('defines all required lazy-loaded routes with modern chunks', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('docs');
    expect(paths).toContain('doc/:id');
    expect(paths).toContain('s/:hash');
    expect(paths).toContain('settings');
    expect(paths).toContain('**');
  });

  it('configures loadComponent lazy loaders on main routes', () => {
    const rootRoute = routes.find((r) => r.path === '');
    const docsRoute = routes.find((r) => r.path === 'docs');
    const editorRoute = routes.find((r) => r.path === 'doc/:id');
    const readerRoute = routes.find((r) => r.path === 's/:hash');
    const settingsRoute = routes.find((r) => r.path === 'settings');

    expect(typeof rootRoute?.loadComponent).toBe('function');
    expect(typeof docsRoute?.loadComponent).toBe('function');
    expect(typeof editorRoute?.loadComponent).toBe('function');
    expect(typeof readerRoute?.loadComponent).toBe('function');
    expect(typeof settingsRoute?.loadComponent).toBe('function');
  });
});
