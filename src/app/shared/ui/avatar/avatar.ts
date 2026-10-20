import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * A round avatar: the photo when there is one, otherwise the first letter of
 * the name. Decorative (the name is always written next to it), so screen
 * readers skip it. A photo that fails to load falls back to the letter.
 */
@Component({
  selector: 'ink-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.42',
  },
  template: `
    @if (showPhoto()) {
      <!-- no-referrer: the photo's host isn't told which page shows it. -->
      <img
        [src]="src()"
        alt=""
        referrerpolicy="no-referrer"
        decoding="async"
        (error)="failedSrc.set(src())"
      />
    } @else {
      {{ initial() }}
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      border-radius: 50%;
      background: var(--ink-accent-soft);
      color: var(--ink-accent-text);
      font-weight: 700;
      line-height: 1;
      user-select: none;
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class InkAvatar {
  /** Whose avatar: its first letter is shown without a photo. */
  readonly name = input('');
  /** The photo's address; null or empty for none. */
  readonly src = input<string | null | undefined>(null);
  readonly size = input(28);

  /** The photo that failed to load, so a new one is still tried. */
  protected readonly failedSrc = signal<string | null | undefined>(null);
  protected readonly showPhoto = computed(() => !!this.src() && this.src() !== this.failedSrc());
  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '?');
}
