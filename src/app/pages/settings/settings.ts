import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, AppTheme } from '@inkframe-ui/editor/core';
import { DocumentManager } from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';
import { InkIcon } from '../../shared/ui/icons/icon';
import { ToastService } from '../../shared/ui';
import { LayoutService } from '../../shared/layout/layout.service';

@Component({
  selector: 'ink-settings',
  standalone: true,
  imports: [
    CommonModule,
    InkIcon,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  readonly themeService = inject(ThemeService);
  private readonly docManager = inject(DocumentManager);
  private readonly toast = inject(ToastService);
  readonly layout = inject(LayoutService);

  // Dynamic header templates
  readonly headerLeftTpl = viewChild<TemplateRef<any>>('headerLeft');
  readonly headerCenterTpl = viewChild<TemplateRef<any>>('headerCenter');

  constructor() {
    effect(() => {
      const left = this.headerLeftTpl();
      const center = this.headerCenterTpl();
      this.layout.setHeaderTemplates({
        left: left ?? null,
        center: center ?? null,
        right: null,
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.layout.clearHeaderTemplates();
    });
  }

  readonly activeTab = signal<'general' | 'appearance' | 'storage'>('general');
  readonly currentTheme = computed(() => this.themeService.theme());
  readonly docCount = signal<number>(0);
  readonly storageUsed = signal<string>('0 KB');

  async ngOnInit(): Promise<void> {
    await this.updateStats();
  }

  async updateStats(): Promise<void> {
    const docs = await this.docManager.getIndex();
    this.docCount.set(docs.length);
    if (typeof localStorage !== 'undefined') {
      let totalBytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('inkframe')) {
          totalBytes += (localStorage.getItem(k) || '').length * 2;
        }
      }
      this.storageUsed.set((totalBytes / 1024).toFixed(1) + ' KB');
    }
  }

  setTheme(theme: AppTheme): void {
    this.themeService.setTheme(theme);
    this.toast.info(`Theme set to ${theme}`);
  }

  async restoreSampleDoc(): Promise<void> {
    try {
      await this.docManager.createDoc('Welcome to Inkframe ✦', WELCOME_DOC);
      await this.layout.refreshDocs();
      await this.updateStats();
      this.toast.success('Sample document restored');
    } catch {
      this.toast.error('Failed to restore sample document');
    }
  }

  async clearStorage(): Promise<void> {
    if (typeof window !== 'undefined' && confirm('Are you sure you want to clear all local documents? This cannot be undone.')) {
      try {
        localStorage.clear();
        await this.restoreSampleDoc();
        this.toast.warning('Storage cleared and re-initialized');
      } catch {
        this.toast.error('Failed to clear storage');
      }
    }
  }
}
