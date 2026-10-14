import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CALLOUT_KINDS, CalloutKind } from '../../schema/schema';

// Written as `icon: '…'` so scripts/build-icon-font.mjs finds the names: the
// self-hosted icon font holds only the icons it finds, and a missing one shows
// its name as text instead (as "dangerous" did).
const ICONS: Record<CalloutKind, { icon: string }> = {
  info: { icon: 'info' },
  note: { icon: 'sticky_note_2' },
  warning: { icon: 'warning' },
  success: { icon: 'check_circle' },
  danger: { icon: 'error' },
};

@Component({
  selector: 'ink-callout-icon',

  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="callout-icon"
      [attr.aria-label]="'Change callout type (current: ' + kind() + ')'"
      (mousedown)="$event.preventDefault()"
      (click)="next()"
    >
      <span class="material-symbols-outlined">{{ icon() }}</span>
    </button>
  `,
  styles: `
    .callout-icon {
      border: none;
      background: none;
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.7;
      transition:
        opacity 0.15s,
        background 0.15s;
      font-size: 20px;
    }
    .callout-icon:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.06);
    }
  `,
})
export class CalloutIcon {
  readonly kind = input<CalloutKind>('info');
  readonly kindChange = output<CalloutKind>();
  // Shared documents can carry any kind: unknown ones show the info icon.
  protected readonly icon = computed(() => (ICONS[this.kind()] ?? ICONS.info).icon);

  protected next() {
    const i = CALLOUT_KINDS.indexOf(this.kind());
    this.kindChange.emit(CALLOUT_KINDS[(i + 1) % CALLOUT_KINDS.length]);
  }
}

// Backward compatibility alias
export { CalloutIcon as CalloutIconComponent };
