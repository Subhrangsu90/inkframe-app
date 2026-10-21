import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmDialogService, ToastService } from '@app/shared/ui';
import { docPath } from '../documents.paths';
import { DocMeta, DocumentManager } from './document-manager';
import { DocumentChannel } from './document-channel';

/** The document list shown in the sidebar and the docs page, and the actions that change it. */
@Injectable({
  providedIn: 'root',
})
export class DocumentLibrary {
  private readonly docManager = inject(DocumentManager);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly documents = signal<DocMeta[]>([]);
  readonly activeDocId = signal<string>('');
  readonly isCreating = signal<boolean>(false);

  constructor() {
    this.refreshDocs();
    // Documents created, edited or deleted in another tab.
    inject(DocumentChannel).listen(() => void this.refreshDocs());
  }

  setActiveDocId(id: string): void {
    this.activeDocId.set(id);
    this.docManager.setActiveDocId(id);
  }

  async refreshDocs(): Promise<DocMeta[]> {
    const list = await this.docManager.getIndex();
    this.documents.set(list);
    return list;
  }

  /** Creates an empty document and lists it; returns its id. Throws when storage refuses it. */
  async createDocWithoutOpening(title = 'Untitled Document'): Promise<string> {
    const created = await this.docManager.createDoc(title);
    await this.refreshDocs();
    return created.meta.id;
  }

  async createNewDoc(title?: string): Promise<string> {
    this.isCreating.set(true);
    try {
      const id = await this.createDocWithoutOpening(title || undefined);
      this.setActiveDocId(id);
      await this.router.navigateByUrl(docPath(id));
      this.toast.success('New document created');
      return id;
    } catch (e) {
      this.toast.error('Failed to create document');
      throw e;
    } finally {
      this.isCreating.set(false);
    }
  }

  /** Deletes a document after the user confirms; there is no undo or trash. */
  async deleteDoc(id: string, event?: Event): Promise<void> {
    if (event) {
      // Before any await: the click must not also open the document card.
      event.stopPropagation();
      event.preventDefault();
    }
    const title = this.documents()
      .find((d) => d.id === id)
      ?.title?.trim();
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete this document?',
      message: `${title ? `"${title}"` : 'This document'} will be permanently deleted from this browser. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'delete_outline',
    });
    if (!confirmed) return;
    try {
      const nextId = await this.docManager.deleteDoc(id);
      await this.refreshDocs();
      this.toast.info('Document deleted');
      if (this.activeDocId() === id) {
        if (nextId) {
          this.setActiveDocId(nextId);
          await this.router.navigateByUrl(docPath(nextId));
        } else {
          await this.router.navigate(['/docs']);
        }
      }
    } catch {
      this.toast.error('Failed to delete document');
    }
  }
}
