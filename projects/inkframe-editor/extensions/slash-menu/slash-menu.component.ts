import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { EditorService } from '@inkframe-ui/editor/core';

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
            <div class="slash-icon-badge">
              <mat-icon class="slash-icon">{{ item.icon }}</mat-icon>
            </div>
            <div class="slash-text">
              <strong class="slash-label">{{ item.label }}</strong>
              <small class="slash-hint">{{ item.hint }}</small>
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
      z-index: 100;
      margin: 4px 0 0;
      padding: 6px;
      list-style: none;
      background: var(--ink-bg-menu, #1c1d22);
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.15);
      max-height: min(21rem, calc(100vh - 120px));
      min-width: min(260px, calc(100vw - 24px));
      max-width: min(320px, calc(100vw - 24px));
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
      transition: background-color 0.15s ease, border-color 0.15s ease;

      &::-webkit-scrollbar {
        width: 5px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.3);
        border-radius: 4px;
      }
    }
    li {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      padding: 7px 10px;
      cursor: pointer;
      border-radius: 8px;
      color: var(--ink-text-primary, #f1f5f9);
      transition: background-color 0.12s ease, color 0.12s ease;
      text-align: left;
      width: 100%;
      box-sizing: border-box;
    }
    li:hover,
    li.active {
      background: var(--ink-active-bg, rgba(37, 99, 235, 0.15));
      color: var(--ink-text-primary, #ffffff);

      .slash-icon-badge {
        background: var(--ink-active-bg, rgba(37, 99, 235, 0.25));
        border-color: var(--ink-border-focus, #3b82f6);

        .slash-icon {
          color: var(--ink-border-focus, #60a5fa);
        }
      }
      .slash-text strong {
        color: var(--ink-text-primary, #ffffff);
      }
      .slash-text small {
        color: var(--ink-text-secondary, #cbd5e1);
        opacity: 0.95;
      }
    }
    .slash-icon-badge {
      width: 34px;
      height: 34px;
      min-width: 34px;
      min-height: 34px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ink-bg-surface-elevated, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.08));
      transition: all 0.12s ease;
      flex-shrink: 0;

      .slash-icon {
        color: var(--ink-text-secondary, #94a3b8);
        font-size: 19px;
        width: 19px;
        height: 19px;
        line-height: 19px;
        transition: color 0.12s ease;
      }
    }
    .slash-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      line-height: 1.25;
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .slash-text strong {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--ink-text-primary, #f1f5f9);
      display: block;
      text-align: left;
    }
    .slash-text small {
      font-size: 11.5px;
      color: var(--ink-text-secondary, #94a3b8);
      display: block;
      margin-top: 1px;
      text-align: left;
    }
    .slash-empty {
      color: var(--ink-text-muted, #64748b);
      padding: 10px 14px;
      font-style: italic;
      font-size: 13px;
      text-align: center;
      display: block;
    }
  `,
})
export class SlashMenuComponent {
  protected readonly svc = inject(EditorService);
}
