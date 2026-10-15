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
import { ThemeService, AppTheme, StorageError } from '@inkframe-ui/editor/core';
import { DocumentManager } from '@app/features/documents/data-access/document-manager';
import { WELCOME_DOC } from '@app/features/documents/data-access/welcome-doc';
import {
  BACKUP_EXTENSION,
  BackupError,
  BackupService,
  ParsedBackup,
  describeRestore,
} from '@app/features/documents/transfer/backup';
import { StorageHealth } from '@app/features/documents/data-access/storage-health';
import { PwaService } from '@app/core/pwa';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { ConfirmDialogService, ToastService } from '@app/shared/ui';
import { LayoutService } from '@app/layout/layout.service';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  private readonly backup = inject(BackupService);
  private readonly storageHealth = inject(StorageHealth);
  readonly layout = inject(LayoutService);
  readonly pwa = inject(PwaService);

  readonly backupAccept = `${BACKUP_EXTENSION},.json,application/json`;
  /** The backup action in progress, if any. */
  readonly backupBusy = signal<'export' | 'restore' | null>(null);

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

  async exportBackup(): Promise<void> {
    if (this.backupBusy()) return;
    this.backupBusy.set('export');
    try {
      const filename = await this.backup.download(this.storageHealth.unsavedDocs());
      this.toast.success('Downloaded ' + filename);
    } catch (e) {
      console.warn('Backup failed:', e);
      this.toast.error('The backup could not be created');
    } finally {
      this.backupBusy.set(null);
    }
  }

  async onBackupFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again fires (change) again
    if (!file || this.backupBusy()) return;

    let backup: ParsedBackup;
    try {
      backup = this.backup.parse(await file.text());
    } catch (e) {
      this.toast.error(e instanceof BackupError ? e.message : 'This file could not be read');
      return;
    }

    const made = backup.createdAt
      ? ` from ${new Date(backup.createdAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`
      : '';
    const choice = await this.confirmDialog.choose({
      title: 'Restore from backup?',
      message:
        `This backup${made} has ${plural(backup.documents.length, 'document')}. ` +
        'Merge adds what is missing in this browser and never overwrites a document: one that differs is added as a copy. ' +
        `Replace all permanently deletes the ${plural(this.docCount(), 'document')} here first.`,
      confirmText: 'Merge',
      secondaryText: 'Replace all',
      secondaryIsDestructive: true,
      icon: 'history',
    });
    if (choice === 'cancel') return;

    this.backupBusy.set('restore');
    try {
      const summary = await this.backup.restore(backup, choice === 'confirm' ? 'merge' : 'replace');
      this.toast.success(describeRestore(summary), 5000);
    } catch (e) {
      console.warn('Restore failed:', e);
      this.toast.error(
        e instanceof BackupError
          ? e.message
          : e instanceof StorageError && e.reason === 'quota'
            ? 'Storage is full, so the backup was only partly restored.'
            : 'The backup could not be restored',
      );
    } finally {
      await this.layout.refreshDocs();
      await this.updateStats();
      this.backupBusy.set(null);
    }
  }

  async clearStorage(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete all data?',
      message:
        'This permanently deletes every document and image stored on this device. Export a backup first if you might need them. This cannot be undone.',
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
