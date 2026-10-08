import { ChangeDetectionStrategy, Component, effect, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService, TEXT_COLORS } from '@inkframe-ui/editor/core';

@Component({
  selector: 'ink-floating-menu',
  standalone: true,
  imports: [
    FormsModule,
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
           [class.placement-bottom]="m.placement === 'bottom'"
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
                #linkTrigger="matMenuTrigger"
                aria-label="Link"
                matTooltip="Link (Ctrl+K)"
                [attr.aria-pressed]="svc.isLink()"
                [class.active]="linkTrigger.menuOpen || svc.isLink()"
                [matMenuTriggerFor]="floatingLinkMenu"
                (menuOpened)="onLinkMenuOpened()">
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

    <!-- Color Menu (declared outside @if so it survives focus changes) -->
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

    <!-- Link Popover Menu -->
    <mat-menu #floatingLinkMenu="matMenu">
      <div class="ink-link-popover" (click)="$event.stopPropagation()">
        <div class="ink-link-title">Link</div>
        <div class="ink-link-input-wrapper">
          <input type="url"
                 class="ink-link-url-input"
                 [(ngModel)]="linkUrl"
                 placeholder="Paste link (https://...)"
                 (keydown.enter)="applyLink()">
          @if (svc.isLink() && linkUrl) {
            <a [href]="linkUrl"
               target="_blank"
               rel="noopener noreferrer"
               class="ink-link-open-btn"
               matTooltip="Open in new tab">
              <mat-icon>open_in_new</mat-icon>
            </a>
          }
        </div>
        <div class="ink-link-actions">
          <button type="button"
                  class="ink-link-submit-btn"
                  [disabled]="!linkUrl.trim()"
                  (mousedown)="$event.preventDefault()"
                  (click)="applyLink()">
            {{ svc.isLink() ? 'Update' : 'Apply' }}
          </button>
          @if (svc.isLink()) {
            <button type="button"
                    class="ink-link-remove-btn"
                    (mousedown)="$event.preventDefault()"
                    (click)="removeLink()">
              Unlink
            </button>
          }
        </div>
      </div>
    </mat-menu>
  `,
  styles: `
    .ink-floating {
      position: fixed;
      transform: translate(-50%, -100%);
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px 5px;
      background: var(--ink-bg-popover, #212226);
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 8px;
      box-shadow: var(--ink-shadow-popover, 0 4px 20px rgba(0, 0, 0, 0.45));
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
    .ink-floating.placement-bottom {
      transform: translate(-50%, 0);
    }
    .ink-floating button {
      width: 30px !important;
      height: 30px !important;
      min-width: 30px !important;
      padding: 0 !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--ink-text-secondary, #94a3b8);
      border-radius: 5px;
      transition: all 0.12s ease;

      mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
        line-height: 18px !important;
      }

      &:hover:not([disabled]) {
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--ink-text-primary, #f1f5f9);
      }

      &.active {
        background: var(--ink-btn-active-bg, #172c47);
        color: var(--ink-btn-active-text, #60a5fa);
      }
    }
    .ink-floating mat-divider {
      height: 18px;
      border-top-color: var(--ink-border-default, #2e3036);
      margin: 0 3px;
    }
  `,
})
export class FloatingMenuComponent {
  protected readonly svc = inject(EditorService);
  protected readonly textColors = TEXT_COLORS;
  protected readonly colorTrigger = viewChild<MatMenuTrigger>('colorTrigger');
  protected readonly linkTrigger = viewChild<MatMenuTrigger>('linkTrigger');
  protected linkUrl = '';

  constructor() {
    effect(() => {
      if (!this.svc.floatingMenu()) {
        this.colorTrigger()?.closeMenu();
        this.linkTrigger()?.closeMenu();
      }
    });
  }

  protected onLinkMenuOpened(): void {
    this.linkUrl = this.svc.getLinkHref() || '';
  }

  protected applyLink(): void {
    if (this.linkUrl.trim()) {
      this.svc.setLink(this.linkUrl.trim());
      this.linkTrigger()?.closeMenu();
    }
  }

  protected removeLink(): void {
    this.svc.removeLink();
    this.linkUrl = '';
    this.linkTrigger()?.closeMenu();
  }
}
