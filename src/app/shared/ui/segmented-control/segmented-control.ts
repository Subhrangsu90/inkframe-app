import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface SegmentedControlOption<T = string> {
  value: T;
  label: string;
  icon?: string;
}

@Component({
  selector: 'ink-segmented-control',

  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ink-segmented-control"
      role="tablist"
      [attr.aria-label]="ariaLabel() || 'View mode switcher'"
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="tab"
          class="ink-segment-btn ink-focus-ring"
          [class.active]="value() === option.value"
          [attr.aria-selected]="value() === option.value"
          (click)="selectOption(option.value)"
        >
          @if (option.icon) {
            <mat-icon class="segment-icon">{{ option.icon }}</mat-icon>
          }
          <span class="segment-label">{{ option.label }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .ink-segmented-control {
      display: inline-flex;
      align-items: center;
      background: var(--ink-surface-2, #f1f0ec);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: var(--ink-radius-pill, 9999px);
      padding: 3px;
      gap: 2px;
      box-sizing: border-box;
      user-select: none;
    }

    .ink-segment-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: var(--ink-radius-pill, 9999px);
      border: 1px solid transparent;
      background: transparent;
      color: var(--ink-text-muted, #6b6b73);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--ink-transition-fast, 120ms ease-out);
      white-space: nowrap;

      &:hover:not(.active) {
        color: var(--ink-text, #1b1b1f);
      }

      &.active {
        background: var(--ink-surface, #ffffff);
        color: var(--ink-accent, #7c3aed);
        font-weight: 600;
        box-shadow: var(--ink-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
        border-color: rgba(0, 0, 0, 0.04);
      }

      .segment-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .segment-label {
        line-height: 1;
      }
    }
  `,
})
export class SegmentedControlComponent<T = string> {
  public readonly options = input.required<SegmentedControlOption<T>[]>();
  public readonly value = model.required<T>();
  public readonly ariaLabel = input<string>('');

  public readonly selectionChange = output<T>();

  protected selectOption(val: T): void {
    if (this.value() !== val) {
      this.value.set(val);
      this.selectionChange.emit(val);
    }
  }
}
