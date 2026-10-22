import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'ink-empty-state',

  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-empty-state-wrapper">
      <div class="ink-empty-state-icon-badge">
        <mat-icon>{{ icon() || 'description' }}</mat-icon>
      </div>

      <h3 class="ink-empty-state-title">{{ title() }}</h3>

      @if (message()) {
        <p class="ink-empty-state-message">{{ message() }}</p>
      }

      @if (actionText()) {
        <button
          type="button"
          class="ink-empty-state-action-btn ink-btn-base ink-focus-ring"
          (click)="action.emit()"
        >
          @if (actionIcon()) {
            <mat-icon class="btn-icon">{{ actionIcon() }}</mat-icon>
          }
          <span>{{ actionText() }}</span>
        </button>
      }

      <ng-content />
    </div>
  `,
  styles: `
    .ink-empty-state-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 48px 24px;
      max-width: 440px;
      margin: 0 auto;
      box-sizing: border-box;
    }

    .ink-empty-state-icon-badge {
      width: 56px;
      height: 56px;
      border-radius: var(--ink-radius-lg, 16px);
      background: var(--ink-accent-soft, #e0f8f6);
      color: var(--ink-accent-text, #017a78);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(2, 131, 128, 0.12);

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
    }

    .ink-empty-state-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--ink-text, #1b1b1f);
      margin: 0 0 8px;
      letter-spacing: -0.015em;
    }

    .ink-empty-state-message {
      font-size: 0.92rem;
      color: var(--ink-text-muted, #6b6b73);
      line-height: 1.55;
      margin: 0 0 24px;
    }

    .ink-empty-state-action-btn {
      background: var(--ink-accent, #028380);
      color: #ffffff;
      border-radius: var(--ink-radius-md, 10px);
      font-weight: 600;
      box-shadow: var(--ink-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));

      &:hover {
        background: var(--ink-accent-hover, #08726f);
        transform: translateY(-1px);
        box-shadow: var(--ink-shadow-md, 0 4px 16px rgba(0, 0, 0, 0.06));
      }

      &:active {
        transform: scale(0.98);
      }

      .btn-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `,
})
export class EmptyStateComponent {
  public readonly icon = input<string>('description');
  public readonly title = input.required<string>();
  public readonly message = input<string>('');
  public readonly actionText = input<string>('');
  public readonly actionIcon = input<string>('');

  public readonly action = output<void>();
}
