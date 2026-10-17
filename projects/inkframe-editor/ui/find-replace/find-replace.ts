import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EditorService, MAX_SEARCH_MATCHES } from '@inkframe-ui/editor/core';

/**
 * Find and replace panel, docked at the top right of the editor. Opened with
 * Mod-f (find) or Mod-h / Shift-Mod-h (replace) and from the toolbar.
 */
@Component({
  selector: 'ink-find-replace',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.searchOpen()) {
      <div
        class="ink-find"
        role="search"
        aria-label="Find and replace"
        (keydown)="onKeydown($event)"
      >
        <div class="ink-find-row">
          <button
            type="button"
            class="ink-find-btn"
            [attr.aria-expanded]="svc.searchReplaceVisible()"
            aria-label="Show replace"
            matTooltip="Replace (Ctrl+H)"
            (click)="svc.toggleSearchReplace()"
          >
            <mat-icon>{{ svc.searchReplaceVisible() ? 'expand_more' : 'chevron_right' }}</mat-icon>
          </button>
          <div class="ink-find-field">
            <input
              #findInput
              class="ink-find-input"
              type="text"
              placeholder="Find"
              aria-label="Find"
              autocomplete="off"
              spellcheck="false"
              [value]="svc.searchQuery()"
              (input)="onQuery(findInput.value)"
            />
            <span class="ink-find-count" aria-live="polite">{{ status() }}</span>
          </div>
          <button
            type="button"
            class="ink-find-btn"
            [class.active]="svc.searchCaseSensitive()"
            [attr.aria-pressed]="svc.searchCaseSensitive()"
            aria-label="Match case"
            matTooltip="Match case (Alt+C)"
            (click)="toggleCaseSensitive()"
          >
            <mat-icon>match_case</mat-icon>
          </button>
          <button
            type="button"
            class="ink-find-btn"
            [disabled]="!svc.searchMatchCount()"
            aria-label="Previous match"
            matTooltip="Previous (Shift+Enter)"
            (click)="previous()"
          >
            <mat-icon>keyboard_arrow_up</mat-icon>
          </button>
          <button
            type="button"
            class="ink-find-btn"
            [disabled]="!svc.searchMatchCount()"
            aria-label="Next match"
            matTooltip="Next (Enter)"
            (click)="next()"
          >
            <mat-icon>keyboard_arrow_down</mat-icon>
          </button>
          <button
            type="button"
            class="ink-find-btn"
            aria-label="Close find and replace"
            matTooltip="Close (Esc)"
            (click)="svc.closeSearch()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        @if (svc.searchReplaceVisible()) {
          <div class="ink-find-row ink-replace-row">
            <div class="ink-find-field">
              <input
                #replaceInput
                class="ink-find-input"
                type="text"
                placeholder="Replace with"
                aria-label="Replace with"
                autocomplete="off"
                spellcheck="false"
                [value]="replacement()"
                (input)="replacement.set(replaceInput.value)"
              />
            </div>
            <button
              type="button"
              class="ink-find-text-btn"
              [disabled]="!svc.searchMatchCount()"
              (click)="replace()"
            >
              Replace
            </button>
            <button
              type="button"
              class="ink-find-text-btn"
              [disabled]="!svc.searchMatchCount()"
              (click)="replaceAll()"
            >
              Replace all
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: absolute;
      top: 8px;
      right: 12px;
      z-index: 30;
      max-width: calc(100% - 24px);
    }

    .ink-find {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 400px;
      max-width: 100%;
      box-sizing: border-box;
      padding: 6px;
      background: var(--ink-bg-popover, #18181b);
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.08));
      border-radius: 10px;
      box-shadow: var(--ink-shadow-popover, 0 6px 20px rgba(0, 0, 0, 0.4));
    }

    .ink-find-row {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .ink-replace-row {
      gap: 6px;
      padding-left: 30px;
    }

    .ink-find-field {
      position: relative;
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .ink-find-input {
      width: 100%;
      height: 30px;
      box-sizing: border-box;
      padding: 0 8px;
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.08));
      border-radius: 6px;
      background: var(--ink-bg-input, #151516);
      color: var(--ink-text-primary, #f9fafb);
      font: inherit;
      font-size: 13px;
      outline: none;

      &:focus {
        border-color: var(--ink-accent-primary, #028380);
        box-shadow: 0 0 0 3px var(--ink-border-focus, rgba(88, 170, 166, 0.25));
      }
    }

    .ink-find-row:first-child .ink-find-input {
      padding-right: 76px; /* room for the match count */
    }

    .ink-find-count {
      position: absolute;
      right: 8px;
      font-size: 11.5px;
      font-variant-numeric: tabular-nums;
      color: var(--ink-text-muted, rgba(255, 255, 255, 0.4));
      pointer-events: none;
      white-space: nowrap;
    }

    .ink-find-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--ink-text-secondary, rgba(255, 255, 255, 0.65));
      cursor: pointer;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover:not(:disabled) {
        background: var(--ink-btn-hover-bg, rgba(255, 255, 255, 0.06));
        color: var(--ink-text-primary, #f9fafb);
      }

      &.active {
        background: var(--ink-btn-active-bg, rgba(88, 170, 166, 0.16));
        border-color: var(--ink-btn-active-border, rgba(88, 170, 166, 0.32));
        color: var(--ink-btn-active-text, #58aaa6);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      &:focus-visible {
        outline: 2px solid var(--ink-border-focus, rgba(88, 170, 166, 0.45));
        outline-offset: 1px;
      }
    }

    .ink-find-text-btn {
      flex-shrink: 0;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.08));
      border-radius: 6px;
      background: var(--ink-bg-subtle, #1c1c1f);
      color: var(--ink-text-primary, #f9fafb);
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      &:focus-visible {
        outline: 2px solid var(--ink-border-focus, rgba(88, 170, 166, 0.45));
        outline-offset: 1px;
      }
    }

    /* Touch screens: 44px targets. */
    @media (pointer: coarse) {
      .ink-find-input,
      .ink-find-text-btn {
        height: 44px;
      }

      .ink-find-btn {
        width: 44px;
        height: 44px;
      }
    }

    @media (max-width: 480px) {
      :host {
        left: 8px;
        right: 8px;
        max-width: none;
      }

      .ink-find {
        width: 100%;
      }

      .ink-replace-row {
        padding-left: 0;
      }
    }
  `,
})
export class FindReplace {
  protected readonly svc = inject(EditorService);
  private readonly findInput = viewChild<ElementRef<HTMLInputElement>>('findInput');
  protected readonly replacement = signal('');
  /** A message shown instead of the match count until the search changes. */
  private readonly notice = signal<string | null>(null);
  private handledFocusRequests = this.svc.searchFocusRequests();

  protected readonly status = computed(() => {
    const notice = this.notice();
    if (notice) return notice;
    if (!this.svc.searchQuery()) return '';
    const count = this.svc.searchMatchCount();
    if (!count) return 'No results';
    const total = count >= MAX_SEARCH_MATCHES ? `${count}+` : String(count);
    return `${this.svc.searchCurrent() + 1} of ${total}`;
  });

  constructor() {
    // Focus the find field when the panel is opened (or Mod-f is pressed again).
    afterRenderEffect(() => {
      const requests = this.svc.searchFocusRequests();
      const input = this.findInput()?.nativeElement;
      if (!input || requests === this.handledFocusRequests) return;
      this.handledFocusRequests = requests;
      input.focus();
      input.select();
    });
  }

  protected onQuery(query: string): void {
    this.notice.set(null);
    this.svc.setSearchQuery(query);
  }

  protected toggleCaseSensitive(): void {
    this.notice.set(null);
    this.svc.setSearchQuery(this.svc.searchQuery(), !this.svc.searchCaseSensitive());
  }

  protected next(): void {
    this.notice.set(null);
    this.svc.findNext();
  }

  protected previous(): void {
    this.notice.set(null);
    this.svc.findPrevious();
  }

  protected replace(): void {
    this.notice.set(null);
    this.svc.replaceCurrent(this.replacement());
  }

  protected replaceAll(): void {
    const count = this.svc.replaceAll(this.replacement());
    this.notice.set(`Replaced ${count}`);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (event.key === 'Escape') {
      event.preventDefault();
      this.svc.closeSearch();
    } else if (event.key === 'Enter' && target.classList.contains('ink-find-input')) {
      event.preventDefault();
      if (target === this.findInput()?.nativeElement) {
        if (event.shiftKey) this.previous();
        else this.next();
      } else {
        this.replace();
      }
    } else if (mod && !event.altKey && (key === 'f' || key === 'h')) {
      // Keep the browser's find bar (or history page) closed; the search
      // text stays as typed, unlike openSearch() from the document.
      event.preventDefault();
      if (key === 'h' && !this.svc.searchReplaceVisible()) this.svc.toggleSearchReplace();
      const input = this.findInput()?.nativeElement;
      input?.focus();
      input?.select();
    } else if (event.altKey && !mod && key === 'c') {
      event.preventDefault();
      this.toggleCaseSensitive();
    }
  }
}

// Backward compatibility alias, matching the other components
export { FindReplace as FindReplaceComponent };
