import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { InkIcon } from '@app/shared/ui/icons/icon';
import type { VersionMeta } from '@app/features/documents/versions/version-history';

export interface VersionGroup {
  label: string;
  versions: VersionMeta[];
}

const startOfDay = (time: number) => {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "Today", "Yesterday", then "Mon, Oct 12" (with the year when it is not this year). */
export function dayLabel(time: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Groups versions (newest first) by day. */
export function groupVersions(versions: VersionMeta[], now = Date.now()): VersionGroup[] {
  const groups: VersionGroup[] = [];
  for (const version of versions) {
    const label = dayLabel(version.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.versions.push(version);
    else groups.push({ label, versions: [version] });
  }
  return groups;
}

const REASON_LABELS: Partial<Record<VersionMeta['reason'], string>> = {
  'before-restore': 'Before restoring a version',
  'before-deletion': 'Before a large deletion',
};

/**
 * The list of a document's versions, shown beside the editor. Selecting a
 * version previews it; the page does the previewing and restoring.
 */
@Component({
  selector: 'ink-version-panel',
  imports: [InkIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'version-panel',
    role: 'region',
    'aria-labelledby': 'version-panel-title',
    '[class.is-previewing]': 'selectedId() !== null',
    '(keydown.escape)': 'onEscape($event)',
  },
  template: `
    <header class="vp-header">
      <h2 id="version-panel-title" class="vp-title" tabindex="-1" #heading>
        <ink-icon name="history" [size]="15" />
        Version history
      </h2>
      <button
        type="button"
        class="vp-icon-btn"
        (click)="closed.emit()"
        aria-label="Close version history"
        title="Close"
      >
        <ink-icon name="close" [size]="14" />
      </button>
    </header>

    <div class="vp-save">
      @if (naming()) {
        <form class="vp-name-form" (submit)="submitName($event, nameInput.value)">
          <label for="vp-name-input" class="sr-only">Version name</label>
          <input
            #nameInput
            id="vp-name-input"
            class="vp-name-input"
            placeholder="Name this version"
            maxlength="80"
            autocomplete="off"
          />
          <button type="submit" class="vp-primary-btn" [disabled]="busy()">Save</button>
          <button type="button" class="vp-text-btn" (click)="naming.set(false)">Cancel</button>
        </form>
      } @else {
        <button type="button" class="vp-save-btn" (click)="naming.set(true)" [disabled]="busy()">
          <ink-icon name="bookmark" [size]="14" />
          Save current version
        </button>
      }
    </div>

    <div class="vp-list ink-scrollbar">
      <button
        type="button"
        class="vp-item"
        [class.selected]="selectedId() === null"
        [attr.aria-pressed]="selectedId() === null"
        (click)="selected.emit(null)"
      >
        <span class="vp-item-time">Current version</span>
        <span class="vp-item-meta">What you are editing now</span>
      </button>

      @for (group of groups(); track group.label) {
        <h3 class="vp-group-label">{{ group.label }}</h3>
        @for (version of group.versions; track version.id) {
          <div class="vp-row" [class.selected]="selectedId() === version.id">
            <button
              type="button"
              class="vp-item"
              [class.selected]="selectedId() === version.id"
              [attr.aria-pressed]="selectedId() === version.id"
              (click)="selected.emit(version)"
            >
              <span class="vp-item-time">{{ time(version.createdAt) }}</span>
              @if (version.name) {
                <span class="vp-item-name">
                  <ink-icon name="bookmark" [size]="11" />
                  {{ version.name }}
                </span>
              }
              <span class="vp-item-meta">
                @if (reasonLabel(version); as reason) {
                  {{ reason }} ·
                }
                {{ version.wordCount }} {{ version.wordCount === 1 ? 'word' : 'words' }}
              </span>
            </button>
            <button
              type="button"
              class="vp-icon-btn vp-delete"
              (click)="removed.emit(version)"
              [disabled]="busy()"
              [attr.aria-label]="'Delete the version from ' + time(version.createdAt)"
              title="Delete version"
            >
              <ink-icon name="trash" [size]="13" />
            </button>
          </div>
        }
      } @empty {
        <p class="vp-empty">
          No earlier versions yet. A version is saved every 10 minutes while you edit, and before
          large deletions.
        </p>
      }
    </div>

    <p class="vp-footnote">
      Kept in this browser: every version from the last day, then one a day for 30 days. Named
      versions stay until you delete them.
    </p>
  `,
  styles: `
    :host {
      width: 340px;
      flex: 0 0 340px;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--ink-surface);
      border-left: 1px solid var(--ink-border);
      animation: vp-slide-in 160ms ease-out;
    }

    /* Phones: the list covers the page; it gives way while a version is previewed. */
    @media (max-width: 767px) {
      :host {
        position: absolute;
        inset: 0;
        z-index: 20;
        width: auto;
        border-left: 0;
      }
      :host(.is-previewing) {
        display: none;
      }
    }

    .vp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 12px 8px 16px;
    }

    .vp-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 14px;
      font-weight: 650;
      color: var(--ink-text-heading);
      outline: none;
    }

    .vp-icon-btn {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border: 0;
      border-radius: var(--ink-radius-sm);
      background: transparent;
      color: var(--ink-text-muted);
      cursor: pointer;

      &:hover {
        background: var(--ink-surface-2);
        color: var(--ink-text);
      }
      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .vp-save {
      padding: 4px 16px 12px;
      border-bottom: 1px solid var(--ink-border);
    }

    .vp-save-btn,
    .vp-primary-btn,
    .vp-text-btn {
      height: 32px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: var(--ink-radius-sm);
      font-size: 12.5px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .vp-save-btn {
      width: 100%;
      background: var(--ink-surface);
      border: 1px solid var(--ink-border);
      color: var(--ink-text);

      &:hover:not(:disabled) {
        background: var(--ink-surface-2);
        border-color: var(--ink-border-strong);
      }
    }

    .vp-name-form {
      display: flex;
      gap: 6px;
    }

    .vp-name-input {
      flex: 1;
      min-width: 0;
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--ink-border-strong);
      border-radius: var(--ink-radius-sm);
      background: var(--ink-surface);
      color: var(--ink-text);
      font: inherit;
      font-size: 13px;

      &:focus {
        outline: none;
        border-color: var(--ink-accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ink-accent) 25%, transparent);
      }
    }

    .vp-primary-btn {
      background: var(--ink-accent);
      border: 1px solid transparent;
      color: #fff;

      &:hover:not(:disabled) {
        background: var(--ink-accent-hover);
      }
    }

    .vp-text-btn {
      padding: 0 8px;
      background: transparent;
      border: 0;
      color: var(--ink-text-muted);

      &:hover {
        color: var(--ink-text);
      }
    }

    .vp-list {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      padding: 8px;
    }

    .vp-group-label {
      margin: 14px 8px 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-text-muted);
    }

    .vp-row {
      position: relative;
      display: flex;
      align-items: center;
      border-radius: var(--ink-radius-sm);

      .vp-item {
        padding-right: 40px;
      }

      .vp-delete {
        position: absolute;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
        opacity: 0;
      }

      &:hover .vp-delete,
      &.selected .vp-delete,
      .vp-delete:focus-visible {
        opacity: 1;
      }

      @media (hover: none) {
        .vp-delete {
          opacity: 1;
        }
      }
    }

    .vp-item {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 8px 10px;
      border: 1px solid transparent;
      border-radius: var(--ink-radius-sm);
      background: transparent;
      color: var(--ink-text);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--ink-surface-2);
      }

      &.selected {
        background: var(--ink-accent-soft);
        border-color: color-mix(in srgb, var(--ink-accent) 30%, transparent);
      }
    }

    .vp-item-time {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-text-heading);
    }

    .vp-item-name {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--ink-accent);
      overflow-wrap: anywhere;
    }

    .vp-item-meta {
      font-size: 12px;
      color: var(--ink-text-muted);
    }

    .vp-empty {
      margin: 12px 10px;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--ink-text-muted);
    }

    .vp-footnote {
      margin: 0;
      padding: 10px 16px 14px;
      border-top: 1px solid var(--ink-border);
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--ink-text-muted);
    }

    .vp-item:focus-visible,
    .vp-icon-btn:focus-visible,
    .vp-save-btn:focus-visible,
    .vp-primary-btn:focus-visible,
    .vp-text-btn:focus-visible {
      outline: 2px solid var(--ink-border-focus);
      outline-offset: 1px;
    }

    @keyframes vp-slide-in {
      from {
        opacity: 0;
        transform: translateX(12px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }

    /* Touch screens: 44px targets. */
    @media (pointer: coarse) {
      .vp-icon-btn {
        width: 44px;
        height: 44px;
      }

      .vp-save-btn,
      .vp-primary-btn,
      .vp-text-btn,
      .vp-name-input {
        height: 44px;
      }
    }
  `,
})
export class VersionPanel {
  readonly versions = input.required<VersionMeta[]>();
  /** The previewed version, or null for the current one. */
  readonly selectedId = input<string | null>(null);
  readonly busy = input(false);

  readonly selected = output<VersionMeta | null>();
  readonly saveRequested = output<string>();
  readonly removed = output<VersionMeta>();
  readonly closed = output<void>();

  protected readonly naming = signal(false);
  protected readonly groups = computed(() => groupVersions(this.versions()));

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // Moves focus into the panel when it opens, for keyboard and screen reader users.
    afterNextRender(() => this.heading()?.nativeElement.focus());
    afterRenderEffect(() => {
      if (this.naming()) this.nameInput()?.nativeElement.focus();
    });
  }

  protected time(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  protected reasonLabel(version: VersionMeta): string {
    return REASON_LABELS[version.reason] ?? '';
  }

  protected submitName(event: Event, name: string): void {
    event.preventDefault();
    this.saveRequested.emit(name.trim());
    this.naming.set(false);
  }

  /** Escape leaves naming first, then the preview, then closes the panel. */
  protected onEscape(event: Event): void {
    event.stopPropagation();
    if (this.naming()) this.naming.set(false);
    else if (this.selectedId() !== null) this.selected.emit(null);
    else this.closed.emit();
  }
}
