import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService } from '../editor.service';

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
                aria-label="Text color"
                matTooltip="Text color"
                [disabled]="svc.isCode()"
                [matMenuTriggerFor]="floatingColorMenu">
          <mat-icon [style.color]="svc.isCode() ? 'inherit' : (svc.currentColor() || 'inherit')">format_color_text</mat-icon>
        </button>
        <mat-menu #floatingColorMenu="matMenu">
          <div class="ink-color-grid" (click)="$event.stopPropagation()">
            @for (c of textColors; track c.value) {
              <button type="button"
                      class="ink-color-swatch"
                      [style.background-color]="c.value"
                      [attr.title]="c.name"
                      (click)="svc.setTextColor(c.value)">
              </button>
            }
          </div>
          <mat-divider />
          <button mat-menu-item (click)="svc.removeTextColor()">
            <mat-icon>format_clear</mat-icon>
            <span>Default text color</span>
          </button>
        </mat-menu>

        <button mat-icon-button
                aria-label="Link"
                matTooltip="Link (Ctrl+K)"
                [attr.aria-pressed]="svc.isLink()"
                [class.active]="svc.isLink()"
                (click)="promptLink()">
          <mat-icon>link</mat-icon>
        </button>

        <mat-divider vertical />

        <button mat-icon-button
                aria-label="Clear formatting"
                matTooltip="Clear formatting (Ctrl+\)"
                (click)="svc.clearFormatting()">
          <mat-icon>format_clear</mat-icon>
        </button>
      </div>
    }
  `,
  styles: `
    .ink-floating {
      position: fixed;
      transform: translate(-50%, calc(-100% - 8px));
      z-index: 50;
      display: flex;
      gap: 2px;
      padding: 4px;
      background: var(--mat-sys-surface-container-high, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #c4c7c5);
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    .ink-floating button.active {
      background: var(--mat-sys-secondary-container, #d3e3fd);
      color: var(--mat-sys-on-secondary-container, #041e49);
    }
    .ink-floating mat-divider {
      height: 20px;
      align-self: center;
      margin: 0 4px;
    }

    .ink-color-grid {
      display: grid;
      grid-template-columns: repeat(4, 28px);
      gap: 6px;
      padding: 8px 12px;
      justify-content: center;
    }
    .ink-color-swatch {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      outline: 1px solid rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: transform 0.15s ease, outline-color 0.15s ease;
      padding: 0;

      &:hover {
        transform: scale(1.15);
        outline-color: var(--mat-sys-primary, #0284c7);
      }
    }
  `,
})
export class FloatingMenuComponent {
  protected readonly svc = inject(EditorService);

  protected readonly textColors = [
    { name: 'Default Dark', value: '#1e293b' },
    { name: 'Muted Gray', value: '#64748b' },
    { name: 'Red', value: '#dc2626' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Amber', value: '#d97706' },
    { name: 'Emerald Green', value: '#16a34a' },
    { name: 'Teal', value: '#0d9488' },
    { name: 'Sky Blue', value: '#0284c7' },
    { name: 'Indigo', value: '#4f46e5' },
    { name: 'Purple', value: '#9333ea' },
    { name: 'Pink', value: '#db2777' },
    { name: 'Rose', value: '#e11d48' },
  ];

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
