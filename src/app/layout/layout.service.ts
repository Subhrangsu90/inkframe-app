import { Injectable, signal, TemplateRef } from '@angular/core';

const STORAGE_COLLAPSED_KEY = 'inkframe_sidebar_collapsed';

/** State of the app shell: the sidebar and the header slots pages fill in. */
@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  readonly sidebarCollapsed = signal<boolean>(false);
  readonly mobileOpen = signal<boolean>(false);

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
}
