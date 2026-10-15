import { describe, it, expect } from 'vitest';
import { DocJSON } from '@inkframe-ui/editor/core';
import { ImportError, importFormat, readImportFile } from './doc-import';
import { safeFileName } from './data-url';

const file = (name: string, text: string, type = '') => new File([text], name, { type });

const blocks = (doc: unknown) => ((doc as { doc: DocJSON }).doc.content ?? []) as DocJSON[];

// A 1×1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('importFormat', () => {
  it('recognizes Markdown, HTML and plain text by extension or type', () => {
    expect(importFormat(file('a.md', ''))).toBe('markdown');
    expect(importFormat(file('a.MARKDOWN', ''))).toBe('markdown');
    expect(importFormat(file('notes.txt', ''))).toBe('markdown');
    expect(importFormat(file('page.htm', ''))).toBe('html');
    expect(importFormat(file('clip', '', 'text/html'))).toBe('html');
    expect(importFormat(file('photo.png', '', 'image/png'))).toBeNull();
  });
});

describe('readImportFile', () => {
  it('imports Markdown, titled by its first heading', async () => {
    const { title, doc } = await readImportFile(
      file('notes.md', '# Trip plan\n\n- [ ] Book train\n\n**Bold** text'),
    );
    expect(title).toBe('Trip plan');
    expect(blocks(doc).map((n) => n.type)).toEqual(['heading', 'task_list', 'paragraph']);
  });

  it('titles a file without headings by its page title, else its name', async () => {
    const page =
      '<html><head><title>Quarterly &amp; more</title></head><body><p>Hi</p></body></html>';
    expect((await readImportFile(file('q.html', page))).title).toBe('Quarterly & more');
    expect((await readImportFile(file('Meeting notes.md', 'Just text'))).title).toBe(
      'Meeting notes',
    );
  });

  it('strips scripts from HTML', async () => {
    const { doc } = await readImportFile(
      file('x.html', '<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(2)">'),
    );
    expect(JSON.stringify(doc)).not.toMatch(/alert/);
  });

  it('moves embedded images into image storage', async () => {
    const { doc } = await readImportFile(file('pic.html', `<p><img src="${PNG}" alt="dot"></p>`));
    const image = blocks(doc)[0].content?.find((n) => n.type === 'image');
    expect(String(image?.attrs?.['src'])).toMatch(/^ink-idb:img_/);
  });

  it('refuses other files and files over 10 MB', async () => {
    await expect(readImportFile(file('photo.png', 'x', 'image/png'))).rejects.toThrow(ImportError);
    const big = file('big.md', 'x');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await expect(readImportFile(big)).rejects.toThrow(/larger than 10 MB/);
  });
});

describe('safeFileName', () => {
  it('keeps letters in any script and drops characters file systems reject', () => {
    expect(safeFileName('Q3: plan / "draft"?', 'md')).toBe('Q3 plan draft.md');
    expect(safeFileName('বাংলা নোট', 'html')).toBe('বাংলা নোট.html');
    expect(safeFileName('  ...  ', 'md')).toBe('document.md');
  });
});
