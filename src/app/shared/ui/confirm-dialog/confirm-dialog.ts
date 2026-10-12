import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: string;
}

interface ActiveDialogState {
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private readonly _state = signal<ActiveDialogState | null>(null);
  public readonly state = this._state.asReadonly();

  public confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._state.set({
        options,
        resolve,
      });
    });
  }

  public close(result: boolean): void {
    const current = this._state();
    if (current) {
      current.resolve(result);
      this._state.set(null);
    }
  }
}

@Component({
  selector: 'ink-confirm-dialog',

  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dialogService.state(); as current) {
      <div
        class="ink-dialog-backdrop"
        role="presentation"
        (click)="dialogService.close(false)"
      >
        <div
          class="ink-dialog-card"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="current.options.title"
          (click)="$event.stopPropagation()"
          (keydown.escape)="dialogService.close(false)"
        >
          <div class="ink-dialog-header">
            <div
              class="ink-dialog-icon-badge"
              [class.destructive]="current.options.isDestructive"
            >
              <mat-icon>{{
                current.options.icon ||
                  (current.options.isDestructive ? 'warning' : 'help_outline')
              }}</mat-icon>
            </div>
            <div class="ink-dialog-header-text">
              <h3 class="ink-dialog-title">{{ current.options.title }}</h3>
              <p class="ink-dialog-message">{{ current.options.message }}</p>
            </div>
          </div>

          <div class="ink-dialog-actions">
            <button
              type="button"
              class="ink-dialog-btn ink-dialog-btn-cancel ink-focus-ring"
              (click)="dialogService.close(false)"
            >
              {{ current.options.cancelText || 'Cancel' }}
            </button>
            <button
              type="button"
              class="ink-dialog-btn ink-focus-ring"
              [class.ink-dialog-btn-destructive]="current.options.isDestructive"
              [class.ink-dialog-btn-confirm]="!current.options.isDestructive"
              (click)="dialogService.close(true)"
            >
              {{ current.options.confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .ink-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      animation: ink-dialog-fade-in 150ms ease-out;
    }

    .ink-dialog-card {
      background: var(--ink-surface, #ffffff);
      color: var(--ink-text, #1b1b1f);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: var(--ink-radius-lg, 16px);
      box-shadow: var(--ink-shadow-lg, 0 16px 48px rgba(0, 0, 0, 0.16));
      width: 100%;
      max-width: 420px;
      padding: 24px;
      box-sizing: border-box;
      animation: ink-dialog-pop 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ink-dialog-header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .ink-dialog-icon-badge {
      width: 44px;
      height: 44px;
      border-radius: var(--ink-radius-md, 10px);
      background: var(--ink-accent-soft, #f3eeff);
      color: var(--ink-accent, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      &.destructive {
        background: var(--ink-danger-soft, #fef2f2);
        color: var(--ink-danger, #dc2626);
      }

      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
    }

    .ink-dialog-header-text {
      flex: 1;
      min-width: 0;
    }

    .ink-dialog-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--ink-text, #1b1b1f);
      margin: 0 0 6px;
      letter-spacing: -0.015em;
    }

    .ink-dialog-message {
      font-size: 0.88rem;
      color: var(--ink-text-muted, #6b6b73);
      line-height: 1.5;
      margin: 0;
    }

    .ink-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .ink-dialog-btn {
      height: var(--ink-btn-height, 36px);
      padding: 0 16px;
      border-radius: var(--ink-radius-md, 10px);
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all var(--ink-transition-fast, 120ms ease-out);

      &:active {
        transform: scale(0.98);
      }
    }

    .ink-dialog-btn-cancel {
      background: var(--ink-surface-2, #f1f0ec);
      color: var(--ink-text, #1b1b1f);
      border-color: var(--ink-border, #e8e6e1);

      &:hover {
        background: var(--ink-surface-subtle, #eae8e3);
      }
    }

    .ink-dialog-btn-confirm {
      background: var(--ink-accent, #7c3aed);
      color: #ffffff;

      &:hover {
        background: var(--ink-accent-hover, #6d28d9);
      }
    }

    .ink-dialog-btn-destructive {
      background: var(--ink-danger, #dc2626);
      color: #ffffff;

      &:hover {
        background: #b91c1c;
      }
    }

    @keyframes ink-dialog-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes ink-dialog-pop {
      from {
        opacity: 0;
        transform: scale(0.94);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly dialogService = inject(ConfirmDialogService);
}
