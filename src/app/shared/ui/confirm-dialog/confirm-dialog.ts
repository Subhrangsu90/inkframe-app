import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injectable,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
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
  /**
   * A second answer, shown between Cancel and the confirm button (for
   * example "Replace" next to "Merge"). Ask with choose() to receive it.
   */
  secondaryText?: string;
  /** Shows the second answer in the danger color. */
  secondaryIsDestructive?: boolean;
}

/** The answer to a question asked with choose(). */
export type DialogChoice = 'confirm' | 'secondary' | 'cancel';

interface ActiveDialogState {
  options: ConfirmDialogOptions;
  resolve: (value: DialogChoice) => void;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private readonly _state = signal<ActiveDialogState | null>(null);
  public readonly state = this._state.asReadonly();

  public async confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return (await this.choose(options)) === 'confirm';
  }

  /** Like confirm(), for questions with a second answer (`secondaryText`). */
  public choose(options: ConfirmDialogOptions): Promise<DialogChoice> {
    // A new question replaces an open one, which then counts as cancelled
    // (otherwise its caller would wait forever).
    this.answer('cancel');
    return new Promise<DialogChoice>((resolve) => {
      this._state.set({
        options,
        resolve,
      });
    });
  }

  public close(result: boolean): void {
    this.answer(result ? 'confirm' : 'cancel');
  }

  public answer(choice: DialogChoice): void {
    const current = this._state();
    if (current) {
      current.resolve(choice);
      this._state.set(null);
    }
  }
}

@Component({
  selector: 'ink-confirm-dialog',

  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'cancelIfOpen()',
  },
  template: `
    @if (dialogService.state(); as current) {
      <div class="ink-dialog-backdrop" role="presentation" (click)="dialogService.close(false)">
        <div
          #card
          class="ink-dialog-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ink-dialog-title"
          aria-describedby="ink-dialog-message"
          (click)="$event.stopPropagation()"
          (keydown)="keepFocusInside($event)"
        >
          <div class="ink-dialog-header">
            <div class="ink-dialog-icon-badge" [class.destructive]="current.options.isDestructive">
              <mat-icon>{{
                current.options.icon || (current.options.isDestructive ? 'warning' : 'help_outline')
              }}</mat-icon>
            </div>
            <div class="ink-dialog-header-text">
              <h3 id="ink-dialog-title" class="ink-dialog-title">{{ current.options.title }}</h3>
              <p id="ink-dialog-message" class="ink-dialog-message">
                {{ current.options.message }}
              </p>
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
            @if (current.options.secondaryText) {
              <button
                type="button"
                class="ink-dialog-btn ink-focus-ring"
                [class.ink-dialog-btn-destructive]="current.options.secondaryIsDestructive"
                [class.ink-dialog-btn-cancel]="!current.options.secondaryIsDestructive"
                (click)="dialogService.answer('secondary')"
              >
                {{ current.options.secondaryText }}
              </button>
            }
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
      z-index: var(--ink-z-modal, 1100);
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
        max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
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
      background: var(--ink-accent-soft, #e0f8f6);
      color: var(--ink-accent-text, #017a78);
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
      flex-wrap: wrap;
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
      transition: var(--ink-transition-fast, 120ms ease-out);
      transition-property: background-color, border-color, color, box-shadow, opacity, transform;

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
      background: var(--ink-accent, #028380);
      color: #ffffff;

      &:hover {
        background: var(--ink-accent-hover, #08726f);
      }
    }

    /* A fixed red in both themes: dark mode's --ink-danger is lighter, for text,
       and gives white button text only 3.8:1. */
    .ink-dialog-btn-destructive {
      background: #dc2626;
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

    /* Touch screens: 44px targets. */
    @media (pointer: coarse) {
      .ink-dialog-btn {
        height: 44px;
      }
    }
  `,
})
export class ConfirmDialogComponent {
  protected readonly dialogService = inject(ConfirmDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  /** The element that had focus when the dialog opened; it gets focus back. */
  private opener: HTMLElement | null = null;

  constructor() {
    afterRenderEffect(() => {
      const state = this.dialogService.state();
      const card = this.card()?.nativeElement;
      if (state && card) {
        if (card.contains(this.document.activeElement)) return;
        this.opener ??= this.document.activeElement as HTMLElement | null;
        // For a destructive question the safe answer has focus, so Enter cancels.
        const button = state.options.isDestructive
          ? '.ink-dialog-btn-cancel'
          : '.ink-dialog-btn-confirm';
        card.querySelector<HTMLElement>(button)?.focus();
      } else if (!state && this.opener) {
        const opener = this.opener;
        this.opener = null;
        if (opener.isConnected) opener.focus();
      }
    });
  }

  protected cancelIfOpen(): void {
    if (this.dialogService.state()) this.dialogService.close(false);
  }

  /** Tab and Shift+Tab cycle through the dialog's buttons instead of leaving it. */
  protected keepFocusInside(event: KeyboardEvent): void {
    const card = this.card()?.nativeElement;
    if (event.key !== 'Tab' || !card) return;
    const buttons = Array.from(card.querySelectorAll<HTMLElement>('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
