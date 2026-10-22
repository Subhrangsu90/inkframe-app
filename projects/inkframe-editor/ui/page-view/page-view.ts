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
import { Node as PMNode } from 'prosemirror-model';
import {
  DEFAULT_PAGE_SETUP,
  PageSetup,
  StaticPageView,
  pageMarginLines,
  pageStartsInHtml,
} from '@inkframe-ui/editor/core';

/**
 * The pages of page view, drawn behind the text: one sheet per page, with
 * its header, footer and page number in the margins, and "Page 2 of 5" in
 * the gap below it. Place it first inside `.ink-sheet`, with
 * `pageViewStyle(pages)` and `data-ink-page-view` on the canvas.
 */
@Component({
  selector: 'ink-page-frames',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ink-page-frames', 'aria-hidden': 'true' },
  template: `
    @for (page of pageList(); track page.number) {
      <div class="ink-page-frame" [style.top]="offset(page.number)">
        @for (band of page.bands; track band.edge) {
          <div
            class="ink-page-band"
            [class]="'ink-page-band-' + band.edge"
            [class.ink-page-band-balanced]="band.balanced"
          >
            @for (slot of band.slots; track slot.align) {
              <span
                class="ink-page-slot"
                [class]="'ink-page-slot-' + slot.align"
                [class.is-empty]="!slot.text"
                >{{ slot.text }}</span
              >
            }
          </div>
        }
      </div>
      <div class="ink-page-label" [style.top]="offset(page.number, true)">
        Page {{ page.number }} of {{ pages() }}
      </div>
    }
  `,
})
export class PageFrames {
  /** The number of pages. */
  readonly pages = input(0);
  /** The document's page setup: its header, footer and page numbers. */
  readonly setup = input<PageSetup>(DEFAULT_PAGE_SETUP);

  protected readonly pageList = computed(() => {
    const pages = this.pages();
    const setup = this.setup();
    return Array.from({ length: pages }, (_, i) => {
      const lines = pageMarginLines(setup, i + 1, pages);
      const bands = (['top', 'bottom'] as const).flatMap((edge) => {
        const line = lines[edge];
        if (!line) return [];
        const slots = (['left', 'center', 'right'] as const).map((align) => ({
          align,
          text: line[align],
        }));
        // Centered text with text beside it: three equal columns, so it stays centered.
        const balanced = !!line.center && (!!line.left || !!line.right);
        return [{ edge, slots, balanced }];
      });
      return { number: i + 1, bands };
    });
  });

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
 *     @if (pages()) { <ink-page-frames [pages]="pages()" [setup]="setup" /> }
 *     <div class="ink-sheet-body ink-static-doc ProseMirror" [innerHTML]="html"
 *          [inkPageView]="setup" (pageCount)="pages.set($event)"></div>
 *   </article>
 * </div>
 * ```
 */
@Directive({ selector: '[inkPageView]', exportAs: 'inkPageView' })
export class PageView {
  /** The document's page setup: pages in Pages layout, none in Pageless. */
  readonly inkPageView = input.required<PageSetup>();
  /** The number of pages shown; 0 when page view is off. */
  readonly pageCount = output<number>();

  private view?: StaticPageView;
  private pages = 0;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const setup = this.inkPageView();
      this.view?.setPageSetup(setup);
    });
    // In the browser only (never during server rendering).
    afterNextRender(() => {
      this.view = new StaticPageView(this.el, (pages) => {
        this.pages = pages;
        this.pageCount.emit(pages);
      });
      this.view.setPageSetup(untracked(this.inkPageView));
    });
    inject(DestroyRef).onDestroy(() => this.view?.destroy());
  }

  /**
   * Where the pages shown start, as positions in `doc` (the document this
   * HTML shows), for printing them: `docToHtmlDocument`'s `pageStarts`.
   * Null when page view is off.
   */
  pageStarts(doc: PMNode): number[] | null {
    return this.pages > 0 ? pageStartsInHtml(this.el, doc) : null;
  }
}
