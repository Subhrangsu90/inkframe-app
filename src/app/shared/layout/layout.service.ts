import { Injectable, inject, signal, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentManager, DocMeta } from '@app/documents/document-manager';
import { ConfirmDialogService, ToastService } from '../ui';

const STORAGE_COLLAPSED_KEY = 'inkframe_sidebar_collapsed';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private readonly docManager = inject(DocumentManager);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly sidebarCollapsed = signal<boolean>(false);
  readonly mobileOpen = signal<boolean>(false);
  readonly documents = signal<DocMeta[]>([]);
  readonly activeDocId = signal<string>('');
  readonly isCreating = signal<boolean>(false);

  // Dynamic header templates for current active page
  readonly headerLeftTemplate = signal<TemplateRef<unknown> | null>(null);
  readonly headerCenterTemplate = signal<TemplateRef<unknown> | null>(null);
  readonly headerRightTemplate = signal<TemplateRef<unknown> | null>(null);

  setHeaderTemplates(templates: {
    left?: TemplateRef<unknown> | null;
    center?: TemplateRef<unknown> | null;
    right?: TemplateRef<unknown> | null;
  }): void {
    this.headerLeftTemplate.set(templates.left ?? null);
    this.headerCenterTemplate.set(templates.center ?? null);
    this.headerRightTemplate.set(templates.right ?? null);
  }

  clearHeaderTemplates(): void {
    this.headerLeftTemplate.set(null);
    this.headerCenterTemplate.set(null);
    this.headerRightTemplate.set(null);
  }

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_COLLAPSED_KEY);
        if (saved !== null) {
          this.sidebarCollapsed.set(saved === 'true');
        }
      } catch {
        // Storage unavailable: keep the default sidebar state.
      }
    }
    this.refreshDocs();
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      } catch {
        // Storage unavailable (private mode or blocked): the choice lasts for this visit.
      }
    }
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(collapsed));
      } catch {
        // Storage unavailable (private mode or blocked): the choice lasts for this visit.
      }
    }
  }

  toggleMobile(): void {
    this.mobileOpen.set(!this.mobileOpen());
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
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
      this.closeMobile();
      await this.router.navigate(['/doc', id]);
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
          await this.router.navigate(['/doc', nextId]);
        } else {
          await this.router.navigate(['/docs']);
        }
      }
    } catch {
      this.toast.error('Failed to delete document');
    }
  }
}
