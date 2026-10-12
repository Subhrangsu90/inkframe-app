import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from './layout.service';
import { DocMeta, DocumentManager } from '../../core/document-manager';
import { ConfirmDialogService } from '../ui';

describe('LayoutService.deleteDoc', () => {
  const docs: DocMeta[] = [
    { id: 'a', title: 'Launch plan', wordCount: 3, createdAt: 0, updatedAt: 0 },
  ];
  let docManager: {
    getIndex: ReturnType<typeof vi.fn>;
    deleteDoc: ReturnType<typeof vi.fn>;
    setActiveDocId: ReturnType<typeof vi.fn>;
  };
  let layout: LayoutService;
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
    layout = TestBed.inject(LayoutService);
    dialog = TestBed.inject(ConfirmDialogService);
    await layout.refreshDocs();
  });

  it('asks first, naming the document, and keeps it when cancelled', async () => {
    const click = new Event('click', { cancelable: true });
    const pending = layout.deleteDoc('a', click);

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
    const pending = layout.deleteDoc('a');
    dialog.close(true);
    await pending;
    expect(docManager.deleteDoc).toHaveBeenCalledWith('a');
  });
});
