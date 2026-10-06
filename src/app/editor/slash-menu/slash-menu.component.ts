import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-slash-menu',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.slashMenu(); as m) {
      <ul class="ink-slash" role="listbox" aria-label="Insert block"
          [style.left.px]="m.left" [style.top.px]="m.top"
          (mousedown)="$event.preventDefault()">
        @for (item of svc.slashItems(); track item.id; let i = $index) {
          <li role="option"
              [attr.aria-selected]="i === svc.slashActive()"
              [class.active]="i === svc.slashActive()"
              (click)="svc.runSlashItem(item)">
            <mat-icon class="slash-icon">{{ item.icon }}</mat-icon>
            <div class="slash-text">
              <strong>{{ item.label }}</strong>
              <small>{{ item.hint }}</small>
            </div>
          </li>
        } @empty {
          <li class="slash-empty" aria-disabled="true">No matches</li>
        }
      </ul>
    }
  `,
  styles: `
    .ink-slash {
      position: fixed;
      z-index: 50;
      margin: 4px 0 0;
      padding: 4px;
      list-style: none;
      background: var(--mat-sys-surface-container-high, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #c4c7c5);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      max-height: 20rem;
      overflow: auto;
      min-width: 220px;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.1s;
    }
    li:hover,
    li.active {
      background: var(--mat-sys-secondary-container, #d3e3fd);
    }
    .slash-icon {
      color: var(--mat-sys-on-surface-variant, #444);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .slash-text {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .slash-text strong {
      font-size: 14px;
    }
    .slash-text small {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    .slash-empty {
      color: var(--mat-sys-on-surface-variant, #888);
      padding: 8px 12px;
      font-style: italic;
    }
  `,
})
export class SlashMenuComponent {
  protected readonly svc = inject(EditorService);
}
