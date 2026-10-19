import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { PageSetup, StaticPageView } from '@inkframe-ui/editor/core';

/**
 * The pages of page view, drawn behind the text: one sheet per page with
 * "Page 2 of 5" in the gap below it. Place it first inside `.ink-sheet`, with
 * `pageViewStyle(pages)` and `data-ink-page-view` on the canvas.
 */
@Component({
  selector: 'ink-page-frames',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ink-page-frames', 'aria-hidden': 'true' },
  template: `
    @for (page of pageNumbers(); track page) {
      <div class="ink-page-frame" [style.top]="offset(page)"></div>
      <div class="ink-page-label" [style.top]="offset(page, true)">
        Page {{ page }} of {{ pages() }}
      </div>
    }
  `,
})
export class PageFrames {
  /** The number of pages. */
  readonly pages = input(0);

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.pages() }, (_, i) => i + 1),
  );

  /** Where page `page` (from 1) starts on the sheet, or with `below` its gap. */
  protected offset(page: number, below = false): string {
    const pitch = 'var(--ink-page-height) + var(--ink-page-gap)';
    return `calc((${pitch}) * ${page - 1}${below ? ' + var(--ink-page-height)' : ''})`;
  }
}

/**
 * Page view for document HTML (`docToHtml`), such as a reader or a version
 * preview: on the element that holds the HTML (`.ink-sheet-body`), it splits
 * a Pages document into pages like the editor does. Emits the number of
 * pages, 0 when off, for `<ink-page-frames>` and the canvas.
 *
 * ```html
 * <div class="ink-canvas" [attr.data-ink-layout]="setup.layout"
 *      [attr.data-ink-page-view]="pages() ? '' : null" [style]="style()">
 *   <article class="ink-sheet">
 *     @if (pages()) { <ink-page-frames [pages]="pages()" /> }
 *     <div class="ink-sheet-body ink-static-doc ProseMirror" [innerHTML]="html"
 *          [inkPageView]="setup" (pageCount)="pages.set($event)"></div>
 *   </article>
 * </div>
 * ```
 */
@Directive({ selector: '[inkPageView]' })
export class PageView {
  /** The document's page setup: pages in Pages layout, none in Pageless. */
  readonly inkPageView = input.required<PageSetup>();
  /** The number of pages shown; 0 when page view is off. */
  readonly pageCount = output<number>();

  private view?: StaticPageView;

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect(() => {
      const setup = this.inkPageView();
      this.view?.setPageSetup(setup);
    });
    // In the browser only (never during server rendering).
    afterNextRender(() => {
      this.view = new StaticPageView(el, (pages) => this.pageCount.emit(pages));
      this.view.setPageSetup(untracked(this.inkPageView));
    });
    inject(DestroyRef).onDestroy(() => this.view?.destroy());
  }
}
