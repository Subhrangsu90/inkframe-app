import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService } from '../editor.service';
import { TEXT_COLORS } from '../core/colors';

export interface CellBgColor {
  name: string;
  value: string;
}

export const CELL_BG_COLORS: CellBgColor[] = [
  { name: 'Default', value: '' },
  { name: 'Subtle Grey', value: '#2a2b30' },
  { name: 'Slate', value: '#1e293b' },
  { name: 'Dark Blue', value: '#172554' },
  { name: 'Ocean Cyan', value: '#083344' },
  { name: 'Forest Green', value: '#052e16' },
  { name: 'Muted Amber', value: '#451a03' },
  { name: 'Muted Red', value: '#450a0a' },
  { name: 'Muted Purple', value: '#3b0764' },
  { name: 'Light Slate', value: '#334155' },
  { name: 'Soft Blue', value: '#1e3a8a' },
  { name: 'Soft Green', value: '#065f46' },
  { name: 'Soft Yellow', value: '#78350f' },
  { name: 'Soft Red', value: '#831843' },
];

@Component({
  selector: 'ink-table-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.tableMenu(); as m) {
      <div
        class="ink-table-toolbar"
        role="toolbar"
        aria-label="Table controls"
        [style.left.px]="m.left"
        [style.top.px]="m.top"
        (mousedown)="$event.preventDefault()"
      >
        <!-- Quick Add Row -->
        <button
          type="button"
          class="ink-tbl-btn"
          matTooltip="Insert row below"
          (click)="svc.addRowAfter()"
        >
          <mat-icon class="tbl-icon">add</mat-icon>
          <span class="tbl-label">Row</span>
        </button>

        <!-- Quick Add Column -->
        <button
          type="button"
          class="ink-tbl-btn"
          matTooltip="Insert column right"
          (click)="svc.addColumnAfter()"
        >
          <mat-icon class="tbl-icon">add</mat-icon>
          <span class="tbl-label">Col</span>
        </button>

        <div class="ink-tbl-divider"></div>

        <!-- Alignment ≡ ▾ -->
        <button
          type="button"
          class="ink-tbl-btn"
          matTooltip="Cell alignment"
          [matMenuTriggerFor]="alignMenu"
        >
          <mat-icon class="tbl-icon">{{ alignIcon() }}</mat-icon>
          <mat-icon class="tbl-caret">arrow_drop_down</mat-icon>
        </button>

        <div class="ink-tbl-divider"></div>

        <!-- Grid / Header row toggle -->
        <button
          type="button"
          class="ink-tbl-icon-btn"
          matTooltip="Toggle header row"
          (click)="svc.toggleHeaderRow()"
        >
          <mat-icon class="tbl-icon">grid_on</mat-icon>
        </button>

        <div class="ink-tbl-divider"></div>

        <!-- Cell Background Color -->
        <button
          type="button"
          class="ink-tbl-icon-btn"
          matTooltip="Cell background color"
          [matMenuTriggerFor]="moreMenu"
        >
          <mat-icon class="tbl-icon">palette</mat-icon>
        </button>

        <div class="ink-tbl-divider"></div>

        <!-- Table options ▾ -->
        <button
          type="button"
          class="ink-tbl-btn"
          [matMenuTriggerFor]="tableOptionsMenu"
          matTooltip="Table & row/col operations"
        >
          <mat-icon class="tbl-icon">tune</mat-icon>
          <span class="tbl-label">Options</span>
          <mat-icon class="tbl-caret">arrow_drop_down</mat-icon>
        </button>
      </div>
    }

    <!-- Hidden trigger for Column Header ▾ Menu -->
    <button
      #colMenuTrigger="matMenuTrigger"
      class="ink-hidden-col-trigger"
      [style.left.px]="colMenuPos().x"
      [style.top.px]="colMenuPos().y"
      [matMenuTriggerFor]="colMenu"
      aria-hidden="true"
      tabindex="-1"
    ></button>

    <!-- Table Options MatMenu -->
    <mat-menu #tableOptionsMenu="matMenu" class="ink-table-mat-menu">
      <button mat-menu-item (click)="svc.addRowBefore()">
        <mat-icon>keyboard_arrow_up</mat-icon>
        <span>Insert row above</span>
      </button>
      <button mat-menu-item (click)="svc.addRowAfter()">
        <mat-icon>keyboard_arrow_down</mat-icon>
        <span>Insert row below</span>
      </button>
      <button mat-menu-item (click)="svc.addColumnBefore()">
        <mat-icon>keyboard_arrow_left</mat-icon>
        <span>Insert column left</span>
      </button>
      <button mat-menu-item (click)="svc.addColumnAfter()">
        <mat-icon>keyboard_arrow_right</mat-icon>
        <span>Insert column right</span>
      </button>
      <mat-divider></mat-divider>
      <button mat-menu-item (click)="svc.deleteRow()">
        <mat-icon>remove_circle_outline</mat-icon>
        <span>Delete row</span>
      </button>
      <button mat-menu-item (click)="svc.deleteColumn()">
        <mat-icon>remove_circle_outline</mat-icon>
        <span>Delete column</span>
      </button>
      <mat-divider></mat-divider>
      <button mat-menu-item class="ink-menu-danger" (click)="svc.deleteTable()">
        <mat-icon color="warn">delete_outline</mat-icon>
        <span class="text-danger">Delete table</span>
      </button>
    </mat-menu>

    <!-- Alignment MatMenu -->
    <mat-menu #alignMenu="matMenu" class="ink-table-mat-menu">
      <button mat-menu-item (click)="setAlign('left')">
        <mat-icon>format_align_left</mat-icon>
        <span>Align left</span>
      </button>
      <button mat-menu-item (click)="setAlign('center')">
        <mat-icon>format_align_center</mat-icon>
        <span>Align center</span>
      </button>
      <button mat-menu-item (click)="setAlign('right')">
        <mat-icon>format_align_right</mat-icon>
        <span>Align right</span>
      </button>
    </mat-menu>

    <!-- More / Background Color MatMenu -->
    <mat-menu #moreMenu="matMenu" class="ink-table-mat-menu">
      <div class="ink-table-color-section" (click)="$event.stopPropagation()">
        <div class="ink-table-color-title">Cell background</div>
        <div class="ink-table-color-grid">
          @for (c of bgColors; track c.name) {
            <button
              type="button"
              class="ink-tbl-color-swatch"
              [style.background-color]="c.value || '#1e1f23'"
              [attr.title]="c.name"
              (mousedown)="$event.preventDefault()"
              (click)="setBackground(c.value)"
            >
              @if (!c.value) {
                <span class="swatch-none">✕</span>
              }
            </button>
          }
        </div>
        <button
          type="button"
          class="ink-tbl-remove-bg-btn"
          (mousedown)="$event.preventDefault()"
          (click)="setBackground(null)"
        >
          Clear background
        </button>
      </div>
      <mat-divider></mat-divider>
      <button mat-menu-item class="ink-menu-danger" (click)="svc.deleteTable()">
        <mat-icon color="warn">delete_outline</mat-icon>
        <span class="text-danger">Delete table</span>
      </button>
    </mat-menu>

    <!-- Column Header Context Menu -->
    <mat-menu #colMenu="matMenu" class="ink-table-mat-menu">
      <button mat-menu-item (click)="svc.addColumnBefore()">
        <mat-icon>keyboard_arrow_left</mat-icon>
        <span>Insert column left</span>
      </button>
      <button mat-menu-item (click)="svc.addColumnAfter()">
        <mat-icon>keyboard_arrow_right</mat-icon>
        <span>Insert column right</span>
      </button>
      <mat-divider></mat-divider>
      <button mat-menu-item (click)="svc.deleteColumn()">
        <mat-icon>remove_circle_outline</mat-icon>
        <span>Delete column</span>
      </button>
      <mat-divider></mat-divider>
      <button mat-menu-item (click)="setAlign('left')">
        <mat-icon>format_align_left</mat-icon>
        <span>Align left</span>
      </button>
      <button mat-menu-item (click)="setAlign('center')">
        <mat-icon>format_align_center</mat-icon>
        <span>Align center</span>
      </button>
      <button mat-menu-item (click)="setAlign('right')">
        <mat-icon>format_align_right</mat-icon>
        <span>Align right</span>
      </button>
    </mat-menu>
  `,
  styles: `
    .ink-table-toolbar {
      position: fixed;
      transform: translate(-50%, 0);
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px 6px;
      background: var(--ink-bg-popover, #212226);
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 8px;
      box-shadow: var(--ink-shadow-popover, 0 4px 16px rgba(0, 0, 0, 0.4));
      color: var(--ink-text-secondary, #94a3b8);
      user-select: none;
      max-width: calc(100vw - 16px);
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      &::-webkit-scrollbar {
        display: none;
      }
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }

    .ink-tbl-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: none;
      border-radius: 6px;
      padding: 4px 8px;
      color: var(--ink-text-secondary, #94a3b8);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s ease;

      &:hover {
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-primary, #f1f5f9);
      }
    }

    .ink-tbl-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--ink-text-secondary, #94a3b8);
      cursor: pointer;
      padding: 0;
      transition: all 0.12s ease;

      &:hover {
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-primary, #f1f5f9);
      }
    }

    .tbl-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: inherit;
    }

    .tbl-caret {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-left: -2px;
      color: var(--ink-text-secondary, #94a3b8);
    }

    .ink-tbl-divider {
      width: 1px;
      height: 16px;
      background: var(--ink-border-default, #2e3036);
      margin: 0 2px;
    }

    .ink-hidden-col-trigger {
      position: fixed;
      width: 0;
      height: 0;
      padding: 0;
      margin: 0;
      border: none;
      background: transparent;
      pointer-events: none;
      opacity: 0;
    }

    .ink-table-color-section {
      padding: 8px 12px;
      background: var(--ink-bg-popover, #212226);
    }

    .ink-table-color-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink-text-secondary, #94a3b8);
      font-weight: 600;
      margin-bottom: 8px;
    }

    .ink-table-color-grid {
      display: grid;
      grid-template-columns: repeat(7, 24px);
      gap: 6px;
      margin-bottom: 8px;
    }

    .ink-tbl-color-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.12));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: transform 0.1s ease, border-color 0.1s ease;

      &:hover {
        transform: scale(1.15);
        border-color: var(--ink-border-focus, #60a5fa);
      }

      .swatch-none {
        font-size: 10px;
        color: var(--ink-text-secondary, #94a3b8);
      }
    }

    .ink-tbl-remove-bg-btn {
      width: 100%;
      background: var(--ink-bg-subtle, transparent);
      border: 1px dashed var(--ink-border-default, #3c4043);
      border-radius: 4px;
      padding: 4px;
      color: var(--ink-text-secondary, #94a3b8);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.12s ease;

      &:hover {
        background: var(--ink-bg-hover, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-primary, #f1f5f9);
        border-color: var(--ink-border-focus, #60a5fa);
      }
    }

    .text-danger {
      color: var(--ink-danger-text, #f87171) !important;
    }
  `,
})
export class TableToolbarComponent {
  protected readonly svc = inject(EditorService);
  protected readonly bgColors = CELL_BG_COLORS;
  protected readonly alignIcon = signal<'format_align_left' | 'format_align_center' | 'format_align_right'>('format_align_left');
  protected readonly colMenuPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  private readonly colMenuTrigger = viewChild<MatMenuTrigger>('colMenuTrigger');

  constructor() {
    if (typeof window !== 'undefined') {
      const handler = (evt: Event) => {
        const customEvt = evt as CustomEvent<{ clientX: number; clientY: number }>;
        if (customEvt.detail) {
          this.colMenuPos.set({ x: customEvt.detail.clientX, y: customEvt.detail.clientY });
          // Open menu on next microtask
          setTimeout(() => {
            this.colMenuTrigger()?.openMenu();
          }, 0);
        }
      };

      window.addEventListener('ink-open-column-menu', handler);

      inject(DestroyRef).onDestroy(() => {
        window.removeEventListener('ink-open-column-menu', handler);
      });
    }
  }

  protected setAlign(align: 'left' | 'center' | 'right'): void {
    if (align === 'center') this.alignIcon.set('format_align_center');
    else if (align === 'right') this.alignIcon.set('format_align_right');
    else this.alignIcon.set('format_align_left');
    this.svc.setCellAlignment(align);
  }

  protected setBackground(color: string | null): void {
    this.svc.setCellBackground(color);
  }
}
