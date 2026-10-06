import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CALLOUT_KINDS, CalloutKind } from '../core/schema';

const ICONS: Record<CalloutKind, string> = {
  info: 'info',
  warning: 'warning',
  success: 'check_circle',
  danger: 'dangerous',
};

@Component({
  selector: 'ink-callout-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="callout-icon"
      [attr.aria-label]="'Change callout type (current: ' + kind() + ')'"
      (mousedown)="$event.preventDefault()"
      (click)="next()">
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
      transition: opacity 0.15s, background 0.15s;
      font-size: 20px;
    }
    .callout-icon:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.06);
    }
  `,
})
export class CalloutIconComponent {
  readonly kind = input<CalloutKind>('info');
  readonly kindChange = output<CalloutKind>();
  protected readonly icon = computed(() => ICONS[this.kind()]);

  protected next() {
    const i = CALLOUT_KINDS.indexOf(this.kind());
    this.kindChange.emit(CALLOUT_KINDS[(i + 1) % CALLOUT_KINDS.length]);
  }
}
