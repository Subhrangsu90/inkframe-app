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
      padding: 6px;
      list-style: none;
      background: var(--ink-bg-popover, #212226);
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 12px;
      box-shadow: var(--ink-shadow-popover, 0 4px 16px rgba(0, 0, 0, 0.25));
      max-height: 20rem;
      overflow: auto;
      min-width: 230px;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 8px;
      color: var(--ink-text-primary, #f1f5f9);
      transition: background-color 0.12s ease, color 0.12s ease;
    }
    li:hover,
    li.active {
      background: var(--ink-active-bg, #172c47);
      color: var(--ink-active-text, #60a5fa);

      .slash-icon {
        color: var(--ink-active-text, #60a5fa);
      }
      .slash-text strong {
        color: var(--ink-active-text, #60a5fa);
      }
      .slash-text small {
        color: var(--ink-active-text, #60a5fa);
        opacity: 0.9;
      }
    }
    .slash-icon {
      color: var(--ink-text-secondary, #94a3b8);
      font-size: 20px;
      width: 20px;
      height: 20px;
      transition: color 0.12s ease;
    }
    .slash-text {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .slash-text strong {
      font-size: 14px;
      color: var(--ink-text-primary, #f1f5f9);
    }
    .slash-text small {
      font-size: 12px;
      color: var(--ink-text-secondary, #94a3b8);
    }
    .slash-empty {
      color: var(--ink-text-muted, #64748b);
      padding: 8px 12px;
      font-style: italic;
    }
  `,
})
export class SlashMenuComponent {
  protected readonly svc = inject(EditorService);
}
