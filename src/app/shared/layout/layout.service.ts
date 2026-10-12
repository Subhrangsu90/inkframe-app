import { Injectable, inject, signal, TemplateRef } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentManager, DocMeta } from '../../core/document-manager';
import { ToastService } from '../ui';

const STORAGE_COLLAPSED_KEY = 'inkframe_sidebar_collapsed';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private readonly docManager = inject(DocumentManager);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly sidebarCollapsed = signal<boolean>(false);
  readonly mobileOpen = signal<boolean>(false);
  readonly documents = signal<DocMeta[]>([]);
  readonly activeDocId = signal<string>('');
  readonly isCreating = signal<boolean>(false);

  // Dynamic header templates for current active page
  readonly headerLeftTemplate = signal<TemplateRef<any> | null>(null);
  readonly headerCenterTemplate = signal<TemplateRef<any> | null>(null);
  readonly headerRightTemplate = signal<TemplateRef<any> | null>(null);

  setHeaderTemplates(templates: {
    left?: TemplateRef<any> | null;
    center?: TemplateRef<any> | null;
    right?: TemplateRef<any> | null;
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
      } catch {}
    }
    this.refreshDocs();
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      } catch {}
    }
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_COLLAPSED_KEY, String(collapsed));
      } catch {}
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

  async createNewDoc(title?: string): Promise<string> {
    this.isCreating.set(true);
    try {
      const created = await this.docManager.createDoc(title || 'Untitled Document');
      await this.refreshDocs();
      this.setActiveDocId(created.meta.id);
      this.closeMobile();
      await this.router.navigate(['/doc', created.meta.id]);
      this.toast.success('New document created');
      return created.meta.id;
    } catch (e) {
      this.toast.error('Failed to create document');
      throw e;
    } finally {
      this.isCreating.set(false);
    }
  }

  async deleteDoc(id: string, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
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
