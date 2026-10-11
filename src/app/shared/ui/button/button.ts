import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  Type,
  booleanAttribute,
  input,
} from '@angular/core';
import { CommonModule, NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { InkIcon, InkIconName } from '../icons/icon';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'subtle' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'button[ink-btn], a[ink-btn], ink-button, ink-btn',
  imports: [CommonModule, NgTemplateOutlet, NgComponentOutlet, InkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'ink-button-root ink-focus-ring',
    '[class.btn-primary]': "variant() === 'primary'",
    '[class.btn-secondary]': "variant() === 'secondary'",
    '[class.btn-outline]': "variant() === 'outline'",
    '[class.btn-subtle]': "variant() === 'subtle'",
    '[class.btn-ghost]': "variant() === 'ghost'",
    '[class.btn-danger]': "variant() === 'danger'",
    '[class.size-sm]': "size() === 'sm'",
    '[class.size-md]': "size() === 'md'",
    '[class.size-lg]': "size() === 'lg'",
    '[class.is-pill]': 'pill()',
    '[class.is-full]': 'fullWidth()',
    '[class.is-disabled]': 'disabled() || loading()',
    '[attr.aria-disabled]': "disabled() || loading() ? 'true' : null",
    '[attr.disabled]': "disabled() || loading() ? '' : null",
  },
  template: `
    <!-- Prefix slot: programmatic icon OR projected prefix -->
    @if (icon(); as iconName) {
      @if (iconPosition() === 'left') {
        <ink-icon [name]="iconName" [size]="size() === 'sm' ? 14 : size() === 'lg' ? 18 : 16" />
      }
    }
    <ng-content select="[prefix], [icon-left], [iconLeft]" />

    <!-- Body: programmatic customComponent OR template OR label OR projected content -->
    @if (customComponent()) {
      <ng-container *ngComponentOutlet="customComponent()!; inputs: componentInputs()" />
    } @else if (template()) {
      <ng-container *ngTemplateOutlet="template()!; context: context()" />
    } @else if (label()) {
      <span>{{ label() }}</span>
    } @else {
      <ng-content />
    }

    <!-- Suffix slot: projected suffix OR programmatic icon -->
    <ng-content select="[suffix], [icon-right], [iconRight]" />
    @if (icon(); as iconName) {
      @if (iconPosition() === 'right') {
        <ink-icon [name]="iconName" [size]="size() === 'sm' ? 14 : size() === 'lg' ? 18 : 16" />
      }
    }

    @if (loading()) {
      <span class="btn-spinner" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &[hidden],
      &.hidden {
        display: none !important;
      }
      font-family: inherit;
      font-weight: 500;
      line-height: 1;
      text-decoration: none;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      box-sizing: border-box;
      border: 1px solid transparent;
      transition:
        background-color var(--ink-transition-fast),
        border-color var(--ink-transition-fast),
        color var(--ink-transition-fast),
        box-shadow var(--ink-transition-fast);

      /* Strict Constraints: NO GRADIENTS, NO SCALE, ONLY TOKENS */

      /* Sizes */
      &.size-sm {
        height: 28px;
        padding: 0 10px;
        font-size: 12px;
        border-radius: var(--ink-radius-sm);
      }

      &.size-md {
        height: var(--ink-btn-height);
        padding: 0 14px;
        font-size: 13.5px;
        border-radius: var(--ink-radius-md);

        @media (max-width: 640px) {
          height: var(--ink-btn-height-mobile);
          padding: 0 16px;
          font-size: 14px;
        }
      }

      &.size-lg {
        height: 44px;
        padding: 0 20px;
        font-size: 15px;
        border-radius: var(--ink-radius-md);
      }

      &.is-pill {
        border-radius: var(--ink-radius-pill);
      }

      &.is-full {
        width: 100%;
      }

      &.is-disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* Variant: Primary */
      &.btn-primary {
        background: var(--ink-accent);
        color: var(--ink-accent-contrast);
        border-color: var(--ink-accent);
        box-shadow: var(--ink-shadow-sm);

        &:hover:not(.is-disabled) {
          background: var(--ink-accent-hover);
          border-color: var(--ink-accent-hover);
          box-shadow: var(--ink-shadow-md);
        }
      }

      /* Variant: Secondary */
      &.btn-secondary {
        background: var(--ink-surface-2);
        color: var(--ink-text);
        border-color: var(--ink-border);
        box-shadow: var(--ink-shadow-sm);

        &:hover:not(.is-disabled) {
          background: var(--ink-surface-subtle);
          border-color: var(--ink-border-strong);
          color: var(--ink-text-heading);
          box-shadow: var(--ink-shadow-md);
        }
      }

      /* Variant: Outline */
      &.btn-outline {
        background: var(--ink-surface);
        color: var(--ink-text);
        border-color: var(--ink-border);
        box-shadow: var(--ink-shadow-sm);

        &:hover:not(.is-disabled) {
          background: var(--ink-surface-2);
          border-color: var(--ink-border-strong);
          color: var(--ink-text-heading);
        }
      }

      /* Variant: Subtle */
      &.btn-subtle {
        background: var(--ink-accent-soft);
        color: var(--ink-accent-text);
        border-color: var(--ink-border);

        &:hover:not(.is-disabled) {
          background: var(--ink-accent);
          color: var(--ink-accent-contrast);
          border-color: var(--ink-accent);
        }
      }

      /* Variant: Ghost */
      &.btn-ghost {
        background: transparent;
        color: var(--ink-text-muted);
        border-color: transparent;

        &:hover:not(.is-disabled) {
          background: var(--ink-surface-2);
          color: var(--ink-text);
          border-color: var(--ink-border);
        }
      }

      /* Variant: Danger */
      &.btn-danger {
        background: var(--ink-danger);
        color: var(--ink-accent-contrast);
        border-color: var(--ink-danger);

        &:hover:not(.is-disabled) {
          box-shadow: var(--ink-shadow-md);
        }
      }
    }

    /* Focus ring using tokens */
    :host(:focus-visible) {
      outline: none;
      box-shadow: 0 0 0 3px var(--ink-border-focus);
      border-color: var(--ink-accent);
    }

    .btn-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: var(--ink-radius-pill);
      animation: ink-btn-spin 0.75s linear infinite;
    }

    @keyframes ink-btn-spin {
      to { transform: rotate(360deg); }
    }
  `,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly pill = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly fullWidth = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly disabled = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly loading = input<boolean, unknown>(false, { transform: booleanAttribute });

  /* Programmatic Rendering Inputs (https://angular.dev/guide/components/programmatic-rendering) */
  readonly label = input<string>('');
  readonly icon = input<InkIconName | null>(null);
  readonly iconPosition = input<'left' | 'right'>('right');
  readonly template = input<TemplateRef<unknown> | null>(null);
  readonly customComponent = input<Type<unknown> | null>(null);
  readonly componentInputs = input<Record<string, unknown>>({});
  readonly context = input<Record<string, unknown>>({});
}

/* Compatibility re-exports */
export { Button as InkButton, Button as ButtonComponent };
