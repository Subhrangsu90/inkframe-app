import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-floating-menu',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.floatingMenu(); as m) {
      <div class="ink-floating" role="toolbar" aria-label="Selection formatting"
           [style.left.px]="m.left" [style.top.px]="m.top"
           (mousedown)="$event.preventDefault()">
        <!-- Typography marks (disabled if code is active) -->
        <button mat-icon-button
                aria-label="Bold"
                [attr.aria-pressed]="svc.isBold()"
                [class.active]="svc.isBold()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleBold()">
          <mat-icon>format_bold</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Italic"
                [attr.aria-pressed]="svc.isItalic()"
                [class.active]="svc.isItalic()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleItalic()">
          <mat-icon>format_italic</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Underline"
                [attr.aria-pressed]="svc.isUnderline()"
                [class.active]="svc.isUnderline()"
                [disabled]="svc.isCode()"
                (click)="svc.toggleUnderline()">
          <mat-icon>format_underlined</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Strikethrough"
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
                [attr.aria-pressed]="svc.isCode()"
                [class.active]="svc.isCode()"
                (click)="svc.toggleCode()">
          <mat-icon>code</mat-icon>
        </button>

        <mat-divider vertical />

        <button mat-icon-button
                aria-label="Clear formatting"
                (click)="svc.clearFormatting()">
          <mat-icon>format_clear</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Link"
                [attr.aria-pressed]="svc.isLink()"
                [class.active]="svc.isLink()"
                (click)="promptLink()">
          <mat-icon>link</mat-icon>
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
  `,
})
export class FloatingMenuComponent {
  protected readonly svc = inject(EditorService);

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
