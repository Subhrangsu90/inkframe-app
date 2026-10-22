import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ThemeService, AppTheme, StorageError } from '@inkframe-ui/editor/core';
import { AuthService } from '@app/features/account/data-access/auth.service';
import {
  DocumentManager,
  formatRelativeTime,
} from '@app/features/documents/data-access/document-manager';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { WELCOME_DOC } from '@app/features/documents/data-access/welcome-doc';
import { BACKUP_EXTENSION } from '@app/features/documents/transfer/file-types';
import type { ParsedBackup } from '@app/features/documents/transfer/backup';
import { StorageHealth } from '@app/features/documents/data-access/storage-health';
import { EditorPreferences } from '@app/features/documents/data-access/editor-preferences';
import { PwaService } from '@app/core/pwa';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { InkAvatar } from '@app/shared/ui/avatar/avatar';
import { ConfirmDialogService } from '@app/shared/ui/confirm-dialog/confirm-dialog';
import { ToastService } from '@app/shared/ui/toast/toast';
import { LayoutService } from '@app/layout/layout.service';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

@Component({
  selector: 'ink-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, InkIcon, InkAvatar],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  readonly themeService = inject(ThemeService);
  private readonly docManager = inject(DocumentManager);
  private readonly library = inject(DocumentLibrary);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly injector = inject(Injector);
  protected readonly storageHealth = inject(StorageHealth);
  readonly layout = inject(LayoutService);
  readonly pwa = inject(PwaService);
  readonly editorPreferences = inject(EditorPreferences);
  readonly auth = inject(AuthService);

  /** Signing in from here comes back here. */
  readonly settingsReturn = { returnTo: '/settings' };
  readonly signingOut = signal(false);

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
  /** When the last backup was exported (or restored) here. */
  readonly lastBackupText = computed(() => {
    const time = this.storageHealth.lastBackup();
    return time ? `Last backup: ${formatRelativeTime(time)}.` : 'No backup yet.';
  });

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
      await this.library.refreshDocs();
      await this.updateStats();
      this.toast.success('Sample document restored');
    } catch {
      this.toast.error('Failed to restore sample document');
    }
  }

  /**
   * Backups load when used: they need the editor's schema, which the
   * Settings page would otherwise download before showing anything.
   */
  private loadBackups() {
    return import('@app/features/documents/transfer/backup');
  }

  async exportBackup(): Promise<void> {
    if (this.backupBusy()) return;
    this.backupBusy.set('export');
    try {
      const { BackupService } = await this.loadBackups();
      const backups = this.injector.get(BackupService);
      const filename = await backups.download(this.storageHealth.unsavedDocs());
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

    let transfer: typeof import('@app/features/documents/transfer/backup');
    try {
      transfer = await this.loadBackups();
    } catch {
      this.toast.error('The backup could not be read. Check your connection and try again.');
      return;
    }
    const { BackupError, describeRestore } = transfer;
    const backups = this.injector.get(transfer.BackupService);
    let backup: ParsedBackup;
    try {
      backup = backups.parse(await file.text());
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
      const summary = await backups.restore(backup, choice === 'confirm' ? 'merge' : 'replace');
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
      await this.library.refreshDocs();
      await this.updateStats();
      this.backupBusy.set(null);
    }
  }

  /** Signs out of the account; documents in this browser stay as they are. */
  async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    const outcome = await this.auth.signOut();
    this.signingOut.set(false);
    if (outcome.ok) this.toast.success('Signed out. Your documents are still here.');
    else this.toast.error(outcome.message);
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
      await this.library.refreshDocs();
      await this.updateStats();
      this.toast.warning('All documents deleted. A fresh welcome document was created.');
    } catch {
      this.toast.error('Failed to clear storage');
    }
  }
}
