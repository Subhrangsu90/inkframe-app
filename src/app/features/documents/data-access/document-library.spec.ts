import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentLibrary } from './document-library';
import { DocMeta, DocumentManager } from './document-manager';
import { ConfirmDialogService } from '@app/shared/ui';

describe('DocumentLibrary.deleteDoc', () => {
  const docs: DocMeta[] = [
    { id: 'a', title: 'Launch plan', wordCount: 3, createdAt: 0, updatedAt: 0 },
  ];
  let docManager: {
    getIndex: ReturnType<typeof vi.fn>;
    deleteDoc: ReturnType<typeof vi.fn>;
    setActiveDocId: ReturnType<typeof vi.fn>;
  };
  let library: DocumentLibrary;
  let dialog: ConfirmDialogService;

  beforeEach(async () => {
    docManager = {
      getIndex: vi.fn(async () => docs),
      deleteDoc: vi.fn(async () => ''),
      setActiveDocId: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DocumentManager, useValue: docManager }],
    });
    library = TestBed.inject(DocumentLibrary);
    dialog = TestBed.inject(ConfirmDialogService);
    await library.refreshDocs();
  });

  it('asks first, naming the document, and keeps it when cancelled', async () => {
    const click = new Event('click', { cancelable: true });
    const pending = library.deleteDoc('a', click);

    // The click is stopped at once, before the question is answered.
    expect(click.defaultPrevented).toBe(true);
    const question = dialog.state()!.options;
    expect(question.isDestructive).toBe(true);
    expect(question.message).toContain('"Launch plan"');

    dialog.close(false);
    await pending;
    expect(docManager.deleteDoc).not.toHaveBeenCalled();
  });

  it('deletes once confirmed', async () => {
    const pending = library.deleteDoc('a');
    dialog.close(true);
    await pending;
    expect(docManager.deleteDoc).toHaveBeenCalledWith('a');
  });
});

describe('DocumentLibrary.noteSaved', () => {
  it('shows a saved entry first, without reading the library again', async () => {
    const entry = (id: string, updatedAt: number): DocMeta => ({
      id,
      title: id,
      wordCount: 1,
      createdAt: 0,
      updatedAt,
    });
    const getIndex = vi.fn(async () => [entry('a', 2), entry('b', 1)]);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DocumentManager, useValue: { getIndex } }],
    });
    const library = TestBed.inject(DocumentLibrary);
    await library.refreshDocs();
    getIndex.mockClear();

    library.noteSaved({ ...entry('b', 3), title: 'B, edited' });
    expect(library.documents().map((d) => d.title)).toEqual(['B, edited', 'a']);
    expect(getIndex).not.toHaveBeenCalled();
  });
});
