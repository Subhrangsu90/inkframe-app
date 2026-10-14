import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorService } from '@inkframe-ui/editor/core';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Words, characters and reading time of the document, below the editor. With
 * text selected, the word count shows the selection too ("12 of 1,204 words").
 */
@Component({
  selector: 'ink-status-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The visible dots are hidden from screen readers, which get a comma instead. -->
    <div class="ink-status-bar" role="group" aria-label="Document statistics">
      <span class="ink-status-item">{{ words() }}</span>
      <span class="ink-status-optional">
        <span class="ink-status-sep" aria-hidden="true">·</span><span class="ink-sr-only">, </span>
        <span class="ink-status-item">{{ characters() }}</span>
      </span>
      <span class="ink-status-sep" aria-hidden="true">·</span><span class="ink-sr-only">, </span>
      <span class="ink-status-item">{{ readingTime() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }

    .ink-status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 14px;
      box-sizing: border-box;
      border-top: 1px solid var(--ink-border-default, rgba(255, 255, 255, 0.08));
      background: var(--ink-bg-toolbar, #131315);
      color: var(--ink-text-muted, rgba(255, 255, 255, 0.4));
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      user-select: none;
    }

    .ink-status-optional {
      display: contents;
    }

    .ink-status-sep {
      opacity: 0.7;
    }

    .ink-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 380px) {
      .ink-status-optional {
        display: none;
      }
    }
  `,
})
export class StatusBar {
  private readonly svc = inject(EditorService);
  private readonly number = new Intl.NumberFormat();

  protected readonly words = computed(() => {
    const total = this.svc.stats().words;
    const selected = this.svc.selectionWords();
    const label = plural(total, 'word', 'words');
    return selected === null
      ? `${this.number.format(total)} ${label}`
      : `${this.number.format(selected)} of ${this.number.format(total)} ${label}`;
  });

  protected readonly characters = computed(() => {
    const n = this.svc.stats().characters;
    return `${this.number.format(n)} ${plural(n, 'character', 'characters')}`;
  });

  protected readonly readingTime = computed(
    () => `${this.number.format(this.svc.stats().readingMinutes)} min read`,
  );
}

// Backward compatibility alias, matching the other components
export { StatusBar as StatusBarComponent };
