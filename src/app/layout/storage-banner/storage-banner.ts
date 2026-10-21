import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  StorageHealth,
  backupReminderDue,
} from '@app/features/documents/data-access/storage-health';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { ToastService } from '@app/shared/ui/toast/toast';

interface BannerMessage {
  /** `error`: edits are not being saved; `warning`: they may be lost; `reminder`: export a backup. */
  tone: 'error' | 'warning' | 'reminder';
  title: string;
  body: string;
}

/**
 * Shown when this browser cannot save: storage is full, or blocked. Offers a
 * backup download, which includes edits that could not be saved.
 */
@Component({
  selector: 'ink-storage-banner',
  imports: [InkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as m) {
      <div
        class="storage-banner"
        [class.is-error]="m.tone === 'error'"
        [class.is-reminder]="m.tone === 'reminder'"
        [attr.role]="m.tone === 'error' ? 'alert' : 'status'"
      >
        <ink-icon
          [name]="m.tone === 'reminder' ? 'database' : 'alert-triangle'"
          [size]="16"
          class="banner-icon"
        />
        <p class="banner-text">
          <strong>{{ m.title }}</strong> {{ m.body }}
        </p>
        <div class="banner-actions">
          <button type="button" class="banner-action" (click)="exportBackup()" [disabled]="busy()">
            <ink-icon name="download" [size]="13" />
            Export backup
          </button>
          <button
            type="button"
            class="banner-close"
            (click)="dismiss()"
            [attr.aria-label]="m.tone === 'reminder' ? 'Remind me later' : 'Dismiss'"
            [attr.title]="m.tone === 'reminder' ? 'Remind me later' : 'Dismiss'"
          >
            <ink-icon name="close" [size]="13" />
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }

    .storage-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px 8px 16px;
      background: var(--ink-warning-soft);
      border-bottom: 1px solid color-mix(in srgb, var(--ink-warning) 30%, transparent);
      color: var(--ink-text);
      font-size: 13px;
      line-height: 1.45;

      &.is-error {
        background: var(--ink-danger-soft);
        border-bottom-color: color-mix(in srgb, var(--ink-danger) 30%, transparent);

        .banner-icon {
          color: var(--ink-danger);
        }
      }

      &.is-reminder {
        background: var(--ink-accent-soft);
        border-bottom-color: color-mix(in srgb, var(--ink-accent) 25%, transparent);

        .banner-icon {
          color: var(--ink-accent-text);
        }
      }

      @media (max-width: 639px) {
        flex-wrap: wrap;
        padding: 10px 12px;
      }
    }

    .banner-icon {
      color: var(--ink-warning);
      align-self: flex-start;
      margin-top: 1px;
    }

    .banner-text {
      flex: 1 1 240px;
      min-width: 0;
      margin: 0;

      strong {
        font-weight: 600;
      }
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .banner-action {
      height: 30px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: var(--ink-radius-sm);
      border: 1px solid var(--ink-border-strong);
      background: var(--ink-surface);
      color: var(--ink-text);
      font-size: 12.5px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        background: var(--ink-surface-2);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .banner-close {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--ink-radius-sm);
      background: transparent;
      color: var(--ink-text-muted);
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, var(--ink-text) 8%, transparent);
        color: var(--ink-text);
      }
    }

    .banner-action:focus-visible,
    .banner-close:focus-visible {
      outline: 2px solid var(--ink-border-focus);
      outline-offset: 1px;
    }
  `,
})
export class StorageBanner {
  protected readonly health = inject(StorageHealth);
  private readonly library = inject(DocumentLibrary);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);

  /** Storage works, and a backup is due (see backupReminderDue). */
  private readonly reminderDue = computed(
    () =>
      this.health.status() === 'ok' &&
      backupReminderDue(
        this.library.documents(),
        this.health.lastBackup(),
        this.health.reminderClosed(),
        Date.now(),
      ),
  );

  protected readonly message = computed((): BannerMessage | null => {
    if (this.reminderDue()) {
      return {
        tone: 'reminder',
        title: 'Back up your documents.',
        body: 'They are kept only in this browser. Export a backup now and then, so you can restore them if its data is cleared.',
      };
    }
    if (this.health.dismissed()) return null;
    switch (this.health.status()) {
      case 'full':
        return {
          tone: 'error',
          title: 'Storage is full.',
          body: 'Your latest changes are not saved. Export a backup, then delete documents or images you no longer need.',
        };
      case 'limited':
        return {
          tone: 'warning',
          title: 'This browser limits storage for Inkframe.',
          body: 'Images are not kept and space is small. Export a backup now and then so you do not lose work.',
        };
      case 'unavailable':
        return {
          tone: 'error',
          title: 'This browser is blocking storage.',
          body: 'Nothing you write can be saved here. Export a backup before you close this tab.',
        };
      default:
        return null;
    }
  });

  /** Closes the banner: the reminder for a while, a problem until the status changes. */
  protected dismiss(): void {
    if (this.reminderDue()) this.health.closeBackupReminder();
    else this.health.dismissed.set(true);
  }

  protected async exportBackup(): Promise<void> {
    this.busy.set(true);
    try {
      // Loaded on demand: backups need the editor schema, which the shell
      // around every page should not download.
      const { BackupService } = await import('@app/features/documents/transfer/backup');
      const backup = this.injector.get(BackupService);
      const filename = await backup.download(this.health.unsavedDocs());
      this.toast.success('Downloaded ' + filename);
    } catch (e) {
      console.warn('Backup failed:', e);
      this.toast.error('The backup could not be created');
    } finally {
      this.busy.set(false);
    }
  }
}
