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
import { ConfirmDialogService, ToastService } from '../../shared/ui';
import { LayoutService } from '../../shared/layout/layout.service';

@Component({
  selector: 'ink-settings',
  standalone: true,
  imports: [CommonModule, InkIcon],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  readonly themeService = inject(ThemeService);
  private readonly docManager = inject(DocumentManager);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly layout = inject(LayoutService);

  // Dynamic header templates
  readonly headerLeftTpl = viewChild<TemplateRef<unknown>>('headerLeft');

  constructor() {
    effect(() => {
      const left = this.headerLeftTpl();
      this.layout.setHeaderTemplates({
        left: left ?? null,
        center: null,
        right: null,
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.layout.clearHeaderTemplates();
    });
  }

  readonly themeOptions: { id: AppTheme; name: string }[] = [
    { id: 'light', name: 'Light' },
    { id: 'dark', name: 'Dark' },
  ];
  readonly currentTheme = computed(() => this.themeService.theme());
  readonly docCount = signal<number>(0);
  readonly storageUsed = signal<string>('0 KB');

  async ngOnInit(): Promise<void> {
    await this.updateStats();
  }

  async updateStats(): Promise<void> {
    const docs = await this.docManager.getIndex();
    this.docCount.set(docs.length);
    // Documents and images live in IndexedDB, so ask the browser for the
    // origin's total usage rather than counting localStorage.
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const { usage = 0 } = await navigator.storage.estimate();
        this.storageUsed.set(
          usage >= 1024 * 1024
            ? (usage / (1024 * 1024)).toFixed(1) + ' MB'
            : (usage / 1024).toFixed(1) + ' KB',
        );
      } catch {
        // The browser declined to estimate usage: keep showing it as unknown.
      }
    }
  }

  setTheme(theme: AppTheme, event?: Event): void {
    this.themeService.setTheme(theme, event);
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
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete all data?',
      message:
        'This permanently deletes every document and image stored on this device. Export anything you want to keep first. This cannot be undone.',
      confirmText: 'Delete everything',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'delete_outline',
    });
    if (!confirmed) return;
    try {
      await this.docManager.clearAll();
      await this.docManager.createDoc('Welcome to Inkframe ✦', WELCOME_DOC);
      await this.layout.refreshDocs();
      await this.updateStats();
      this.toast.warning('All documents deleted. A fresh welcome document was created.');
    } catch {
      this.toast.error('Failed to clear storage');
    }
  }
}
