import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService } from '../editor.service';
import { TEXT_COLORS } from '../core/colors';

@Component({
  selector: 'ink-floating-menu',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.floatingMenu(); as m) {
      <div class="ink-floating" role="toolbar" aria-label="Selection formatting"
           [style.left.px]="m.left" [style.top.px]="m.top"
           (mousedown)="$event.preventDefault()">
        <!-- Typography marks (disabled if code is active) -->
        <button mat-icon-button
                aria-label="Bold"
                matTooltip="Bold (Ctrl+B)"
                [attr.aria-pressed]="svc.isBold()"
                [class.active]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()">
          <mat-icon>format_bold</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Italic"
                matTooltip="Italic (Ctrl+I)"
                [attr.aria-pressed]="svc.isItalic()"
                [class.active]="svc.isItalic()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleItalic()">
          <mat-icon>format_italic</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Underline"
                matTooltip="Underline (Ctrl+U)"
                [attr.aria-pressed]="svc.isUnderline()"
                [class.active]="svc.isUnderline()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleUnderline()">
          <mat-icon>format_underlined</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Strikethrough"
                matTooltip="Strikethrough (Ctrl+Shift+S)"
                [attr.aria-pressed]="svc.isStrike()"
                [class.active]="svc.isStrike()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleStrike()">
          <mat-icon>strikethrough_s</mat-icon>
        </button>

        <mat-divider vertical />

        <!-- Code toggle (individual formatting) -->
        <button mat-icon-button
                aria-label="Inline code"
                matTooltip="Code (Ctrl+E)"
                [attr.aria-pressed]="svc.isCode()"
                [class.active]="svc.isCode()"
                (click)="svc.toggleCode()">
          <mat-icon>code</mat-icon>
        </button>

        <!-- Text Color -->
        <button mat-icon-button
                #colorTrigger="matMenuTrigger"
                aria-label="Text color"
                matTooltip="Text color"
                [disabled]="svc.isCode()"
                [class.active]="colorTrigger.menuOpen || !!svc.currentColor()"
                [matMenuTriggerFor]="floatingColorMenu">
          <mat-icon [style.color]="svc.isCode() ? 'inherit' : (svc.currentColor() || 'inherit')">format_color_text</mat-icon>
        </button>

        <!-- Link -->
        <button mat-icon-button
                aria-label="Link"
                matTooltip="Link (Ctrl+K)"
                [attr.aria-pressed]="svc.isLink()"
                [class.active]="svc.isLink()"
                (click)="promptLink()">
          <mat-icon>link</mat-icon>
        </button>

        <mat-divider vertical />

        <!-- Clear formatting -->
        <button mat-icon-button
                aria-label="Clear formatting"
                matTooltip="Clear formatting (Ctrl+\\)"
                (click)="svc.clearFormatting()">
          <mat-icon>format_clear</mat-icon>
        </button>
      </div>
    }

    <!-- Menu declared outside @if so it is never destroyed while open -->
    <mat-menu #floatingColorMenu="matMenu">
      <div class="ink-color-popover" (click)="$event.stopPropagation()">
        <div class="ink-color-title">Text color</div>
        <div class="ink-color-grid">
          @for (c of textColors; track c.value) {
            <button type="button"
                    class="ink-color-swatch"
                    [class.light]="c.isLight"
                    [class.active]="svc.currentColor() === c.value"
                    [style.background-color]="c.value"
                    [attr.title]="c.name"
                    (mousedown)="$event.preventDefault()"
                    (click)="svc.setTextColor(c.value)">
              @if (svc.currentColor() === c.value) {
                <mat-icon class="swatch-check">check</mat-icon>
              }
            </button>
          }
        </div>
        <button type="button"
                class="ink-remove-color-btn"
                (mousedown)="$event.preventDefault()"
                (click)="svc.removeTextColor()">
          Remove color
        </button>
      </div>
    </mat-menu>
  `,
  styles: `
    .ink-floating {
      position: fixed;
      transform: translate(-50%, calc(-100% - 8px));
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 6px;
      background: #212226;
      border: 1px solid #2e3036;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    }
    .ink-floating button {
      color: #94a3b8;
      border-radius: 6px;
      transition: all 0.12s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f1f5f9;
      }

      &.active {
        background: #172c47;
        color: #60a5fa;
      }
    }
    .ink-floating mat-divider {
      height: 20px;
      border-top-color: #2e3036;
      margin: 0 4px;
    }
  `,
})
export class FloatingMenuComponent {
  protected readonly svc = inject(EditorService);
  protected readonly textColors = TEXT_COLORS;

  protected promptLink(): void {
    if (typeof window === 'undefined') return;
    const current = this.svc.getLinkHref();
    if (this.svc.isLink()) {
      const url = window.prompt('Edit or remove link URL (clear to remove):', current || '');
      if (url === null) return;
      if (!url.trim()) {
        this.svc.removeLink();
      } else {
        this.svc.setLink(url.trim());
      }
    } else {
      const url = window.prompt('Enter link URL (e.g. https://...):');
      if (url?.trim()) {
        this.svc.setLink(url.trim());
      }
    }
  }
}
