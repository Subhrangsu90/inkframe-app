import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-floating-menu',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.floatingMenu(); as m) {
      <div class="ink-floating" role="toolbar" aria-label="Selection formatting"
           [style.left.px]="m.left" [style.top.px]="m.top"
           (mousedown)="$event.preventDefault()">
        <button mat-icon-button
                aria-label="Bold"
                [attr.aria-pressed]="svc.isBold()"
                [class.active]="svc.isBold()"
                (click)="svc.toggleBold()">
          <mat-icon>format_bold</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Italic"
                [attr.aria-pressed]="svc.isItalic()"
                [class.active]="svc.isItalic()"
                (click)="svc.toggleItalic()">
          <mat-icon>format_italic</mat-icon>
        </button>
        <button mat-icon-button
                aria-label="Inline code"
                [attr.aria-pressed]="svc.isCode()"
                [class.active]="svc.isCode()"
                (click)="svc.toggleCode()">
          <mat-icon>code</mat-icon>
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
