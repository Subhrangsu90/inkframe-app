import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'card' | 'bar' | 'editor';

@Component({
  selector: 'ink-skeleton',

  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (variant()) {
      @case ('editor') {
        <div class="ink-skeleton-editor" [style.max-width]="width() || '760px'">
          <div class="ink-skeleton-shimmer ink-skeleton-title"></div>
          <div class="ink-skeleton-meta-row">
            <div class="ink-skeleton-shimmer ink-skeleton-pill"></div>
            <div class="ink-skeleton-shimmer ink-skeleton-pill"></div>
          </div>
          <div class="ink-skeleton-body-lines">
            @for (line of [1, 2, 3, 4, 5, 6]; track line) {
              <div
                class="ink-skeleton-shimmer ink-skeleton-line"
                [style.width]="line % 2 === 0 ? '85%' : '100%'"
              ></div>
            }
          </div>
        </div>
      }
      @case ('card') {
        <div class="ink-skeleton-card" [style.width]="width() || '100%'">
          <div class="ink-skeleton-shimmer ink-skeleton-card-title"></div>
          <div class="ink-skeleton-shimmer ink-skeleton-card-desc"></div>
          <div class="ink-skeleton-shimmer ink-skeleton-card-meta"></div>
        </div>
      }
      @case ('bar') {
        <div
          class="ink-skeleton-shimmer ink-skeleton-bar"
          [style.width]="width() || '100%'"
          [style.height]="height() || '44px'"
        ></div>
      }
      @case ('circle') {
        <div
          class="ink-skeleton-shimmer ink-skeleton-circle"
          [style.width]="width() || '40px'"
          [style.height]="height() || '40px'"
        ></div>
      }
      @case ('rect') {
        <div
          class="ink-skeleton-shimmer ink-skeleton-rect"
          [style.width]="width() || '100%'"
          [style.height]="height() || '120px'"
          [style.border-radius]="rounded() ? 'var(--ink-radius-md, 10px)' : '4px'"
        ></div>
      }
      @default {
        <div class="ink-skeleton-text-group" [style.width]="width() || '100%'">
          @for (i of countArray(); track i) {
            <div
              class="ink-skeleton-shimmer ink-skeleton-line"
              [style.height]="height() || '14px'"
              [style.width]="
                countArray().length > 1 && i === countArray().length - 1 ? '65%' : '100%'
              "
            ></div>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .ink-skeleton-shimmer {
      background: linear-gradient(
        90deg,
        var(--ink-surface-2, #f1f0ec) 0%,
        var(--ink-surface-subtle, #eae8e3) 50%,
        var(--ink-surface-2, #f1f0ec) 100%
      );
      background-size: 200% 100%;
      animation: ink-skeleton-pulse 1.5s ease-in-out infinite;
      border-radius: var(--ink-radius-sm, 6px);
    }

    .ink-skeleton-text-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ink-skeleton-line {
      height: 14px;
      border-radius: 4px;
    }

    .ink-skeleton-circle {
      border-radius: 50%;
    }

    .ink-skeleton-bar {
      border-radius: var(--ink-radius-md, 10px);
    }

    .ink-skeleton-rect {
      border-radius: var(--ink-radius-md, 10px);
    }

    /* Card Variant */
    .ink-skeleton-card {
      padding: 16px;
      border-radius: var(--ink-radius-md, 10px);
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-sizing: border-box;
    }

    .ink-skeleton-card-title {
      height: 18px;
      width: 70%;
    }

    .ink-skeleton-card-desc {
      height: 14px;
      width: 95%;
    }

    .ink-skeleton-card-meta {
      height: 12px;
      width: 40%;
      margin-top: 4px;
    }

    /* Editor Variant */
    .ink-skeleton-editor {
      margin: 0 auto;
      width: 100%;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-sizing: border-box;
    }

    .ink-skeleton-title {
      height: 36px;
      width: 60%;
      border-radius: var(--ink-radius-sm, 6px);
    }

    .ink-skeleton-meta-row {
      display: flex;
      gap: 10px;
    }

    .ink-skeleton-pill {
      height: 18px;
      width: 80px;
      border-radius: 999px;
    }

    .ink-skeleton-body-lines {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 10px;
    }

    @keyframes ink-skeleton-pulse {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
  `,
})
export class SkeletonComponent {
  public readonly variant = input<SkeletonVariant>('text');
  public readonly width = input<string>('');
  public readonly height = input<string>('');
  public readonly lines = input<number>(1);
  public readonly rounded = input<boolean>(true);

  protected get countArray(): () => number[] {
    return () => Array.from({ length: Math.max(1, this.lines()) }, (_, i) => i);
  }
}
