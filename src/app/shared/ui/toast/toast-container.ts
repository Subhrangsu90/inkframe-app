import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ToastMessage, ToastService } from './toast';

@Component({
  selector: 'ink-toast-container',

  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-toast-wrapper" role="region" aria-label="Notifications" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="ink-toast-item" [attr.data-type]="toast.type" role="status">
          <div class="ink-toast-icon">
            @switch (toast.type) {
              @case ('success') {
                <mat-icon>check_circle</mat-icon>
              }
              @case ('error') {
                <mat-icon>error</mat-icon>
              }
              @case ('warning') {
                <mat-icon>warning</mat-icon>
              }
              @default {
                <mat-icon>info</mat-icon>
              }
            }
          </div>

          <div class="ink-toast-content">
            <span class="ink-toast-message">{{ toast.message }}</span>
          </div>

          @if (toast.action) {
            <button type="button" class="ink-toast-action-btn" (click)="handleAction(toast)">
              {{ toast.action.label }}
            </button>
          }

          <button
            type="button"
            class="ink-toast-close-btn"
            aria-label="Dismiss notification"
            (click)="toastService.dismiss(toast.id)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .ink-toast-wrapper {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      pointer-events: none;
      max-width: 90vw;
      width: max-content;
    }

    .ink-toast-item {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      border-radius: var(--ink-radius-md, 10px);
      background: var(--ink-surface, #ffffff);
      color: var(--ink-text, #1b1b1f);
      border: 1px solid var(--ink-border, #e8e6e1);
      box-shadow: var(--ink-shadow-lg, 0 12px 40px rgba(0, 0, 0, 0.12));
      font-size: 13.5px;
      font-weight: 500;
      animation: ink-toast-slide-up 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: all var(--ink-transition-fast, 120ms ease-out);

      &[data-type='success'] {
        border-color: rgba(22, 163, 74, 0.3);
        .ink-toast-icon mat-icon {
          color: var(--ink-success, #16a34a);
        }
      }

      &[data-type='error'] {
        border-color: rgba(220, 38, 38, 0.3);
        .ink-toast-icon mat-icon {
          color: var(--ink-danger, #dc2626);
        }
      }

      &[data-type='warning'] {
        border-color: rgba(245, 158, 11, 0.3);
        .ink-toast-icon mat-icon {
          color: var(--ink-warning, #f59e0b);
        }
      }

      &[data-type='info'] {
        border-color: rgba(124, 58, 237, 0.3);
        .ink-toast-icon mat-icon {
          color: var(--ink-accent, #7c3aed);
        }
      }
    }

    .ink-toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .ink-toast-content {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
    }

    .ink-toast-message {
      line-height: 1.4;
      word-break: break-word;
    }

    .ink-toast-action-btn {
      background: var(--ink-accent-soft, #f3eeff);
      color: var(--ink-accent-text, #6d28d9);
      border: 1px solid rgba(124, 58, 237, 0.2);
      border-radius: var(--ink-radius-sm, 6px);
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--ink-transition-fast, 120ms ease-out);

      &:hover {
        background: var(--ink-accent, #7c3aed);
        color: #ffffff;
      }
    }

    .ink-toast-close-btn {
      background: transparent;
      border: none;
      color: var(--ink-text-muted, #6b6b73);
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--ink-radius-sm, 6px);
      transition: all var(--ink-transition-fast, 120ms ease-out);

      &:hover {
        background: var(--ink-surface-2, #f1f0ec);
        color: var(--ink-text, #1b1b1f);
      }

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    @keyframes ink-toast-slide-up {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `,
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);

  protected handleAction(toast: ToastMessage): void {
    if (toast.action) {
      toast.action.onClick();
      this.toastService.dismiss(toast.id);
    }
  }
}
