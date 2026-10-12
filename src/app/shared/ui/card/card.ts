import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  Type,
  booleanAttribute,
  input,
} from '@angular/core';
import { CommonModule, NgComponentOutlet, NgTemplateOutlet } from '@angular/common';

export type CardVariant = 'default' | 'surface' | 'subtle' | 'featured' | 'interactive';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
export type CardRadius = 'none' | 'sm' | 'md' | 'lg' | 'pill';
export type CardShadow = 'none' | 'sm' | 'md' | 'lg';

@Component({
  selector: 'ink-card, [ink-card]',
  imports: [CommonModule, NgTemplateOutlet, NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ink-card-root"
      [class.variant-default]="variant() === 'default'"
      [class.variant-surface]="variant() === 'surface'"
      [class.variant-subtle]="variant() === 'subtle'"
      [class.variant-featured]="variant() === 'featured'"
      [class.variant-interactive]="variant() === 'interactive'"
      [class.is-hoverable]="hoverable() || variant() === 'interactive'"
      [class.pad-none]="padding() === 'none'"
      [class.pad-sm]="padding() === 'sm'"
      [class.pad-md]="padding() === 'md'"
      [class.pad-lg]="padding() === 'lg'"
      [class.radius-none]="radius() === 'none'"
      [class.radius-sm]="radius() === 'sm'"
      [class.radius-md]="radius() === 'md'"
      [class.radius-lg]="radius() === 'lg'"
      [class.radius-pill]="radius() === 'pill'"
      [class.shadow-none]="shadow() === 'none'"
      [class.shadow-sm]="shadow() === 'sm'"
      [class.shadow-md]="shadow() === 'md'"
      [class.shadow-lg]="shadow() === 'lg'"
      [class.has-border]="border()"
    >
      <!-- Header slot: programmatic headerTemplate OR title/subtitle OR content-projected header -->
      @if (headerTemplate()) {
        <div class="ink-card-header">
          <ng-container *ngTemplateOutlet="headerTemplate()!; context: context()" />
        </div>
      } @else if (title() || subtitle()) {
        <div class="ink-card-header">
          @if (title()) {
            <h3 class="ink-card-title">{{ title() }}</h3>
          }
          @if (subtitle()) {
            <p class="ink-card-subtitle">{{ subtitle() }}</p>
          }
        </div>
      } @else {
        <div class="ink-card-header">
          <ng-content select="[card-header], [cardHeader], [header]" />
        </div>
      }

      <!-- Body: programmatic customComponent OR bodyTemplate OR description OR projected content -->
      <div class="ink-card-body">
        @if (customComponent()) {
          <ng-container *ngComponentOutlet="customComponent()!; inputs: componentInputs()" />
        } @else if (bodyTemplate()) {
          <ng-container *ngTemplateOutlet="bodyTemplate()!; context: context()" />
        } @else if (description()) {
          <p class="ink-card-description">{{ description() }}</p>
          <ng-content />
        } @else {
          <ng-content />
        }
      </div>

      <!-- Footer slot: programmatic footerTemplate OR content-projected footer -->
      @if (footerTemplate()) {
        <div class="ink-card-footer">
          <ng-container *ngTemplateOutlet="footerTemplate()!; context: context()" />
        </div>
      } @else {
        <div class="ink-card-footer">
          <ng-content select="[card-footer], [cardFooter], [footer], [card-actions]" />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      box-sizing: border-box;
    }

    .ink-card-root {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      background: var(--ink-surface);
      color: var(--ink-text);
      border: 1px solid var(--ink-border);
      border-radius: var(--ink-radius-lg);
      box-shadow: var(--ink-shadow-sm);
      transition:
        border-color var(--ink-transition-base),
        box-shadow var(--ink-transition-base),
        background-color var(--ink-transition-base);

      &.has-border {
        border: 1px solid var(--ink-border);
      }

      &:not(.has-border) {
        border: none;
      }

      /* Variants (STRICTLY TOKENS ONLY, NO GRADIENTS, NO SCALE) */
      &.variant-surface {
        background: var(--ink-surface);
      }

      &.variant-subtle {
        background: var(--ink-surface-subtle);
      }

      &.variant-featured {
        background: var(--ink-surface);
        border-color: var(--ink-accent);
        box-shadow: var(--ink-shadow-md);

        &:hover {
          border-color: var(--ink-accent-hover);
          box-shadow: var(--ink-shadow-lg);
        }
      }

      &.variant-interactive,
      &.is-hoverable {
        &:hover {
          border-color: var(--ink-accent);
          box-shadow: var(--ink-shadow-md);
        }
      }

      /* Padding */
      &.pad-none { padding: 0; }
      &.pad-sm { padding: 12px; }
      &.pad-md { padding: 20px; }
      &.pad-lg { padding: 28px; }

      /* Radius */
      &.radius-none { border-radius: 0; }
      &.radius-sm { border-radius: var(--ink-radius-sm); }
      &.radius-md { border-radius: var(--ink-radius-md); }
      &.radius-lg { border-radius: var(--ink-radius-lg); }
      &.radius-pill { border-radius: var(--ink-radius-pill); }

      /* Shadows */
      &.shadow-none { box-shadow: none; }
      &.shadow-sm { box-shadow: var(--ink-shadow-sm); }
      &.shadow-md { box-shadow: var(--ink-shadow-md); }
      &.shadow-lg { box-shadow: var(--ink-shadow-lg); }
    }

    .ink-card-header {
      &:empty {
        display: none;
      }
      margin-bottom: 16px;
    }

    .ink-card-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ink-text-heading);
      margin: 0 0 6px 0;
    }

    .ink-card-subtitle {
      font-size: 0.875rem;
      color: var(--ink-text-muted);
      margin: 0;
      line-height: 1.5;
    }

    .ink-card-body {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }

    .ink-card-description {
      font-size: 0.875rem;
      color: var(--ink-text-muted);
      line-height: 1.6;
      margin: 0 0 12px 0;
    }

    .ink-card-footer {
      &:empty {
        display: none;
      }
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--ink-border);
    }
  `,
})
export class Card {
  readonly variant = input<CardVariant>('default');
  readonly padding = input<CardPadding>('md');
  readonly radius = input<CardRadius>('lg');
  readonly shadow = input<CardShadow>('sm');
  readonly hoverable = input<boolean, unknown>(false, { transform: booleanAttribute });
  readonly border = input<boolean, unknown>(true, { transform: booleanAttribute });

  /* Declarative text inputs */
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly description = input<string>('');

  /* Programmatic Rendering Inputs (https://angular.dev/guide/components/programmatic-rendering) */
  readonly headerTemplate = input<TemplateRef<unknown> | null>(null);
  readonly bodyTemplate = input<TemplateRef<unknown> | null>(null);
  readonly footerTemplate = input<TemplateRef<unknown> | null>(null);
  readonly customComponent = input<Type<unknown> | null>(null);
  readonly componentInputs = input<Record<string, unknown>>({});
  readonly context = input<Record<string, unknown>>({});
}

/* Compatibility re-exports */
export { Card as InkCard, Card as CardComponent };
