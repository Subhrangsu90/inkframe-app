import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  MARGIN_PRESETS,
  MIN_TEXT_AREA_MM,
  MarginPreset,
  PAPER_SIZES,
  PageLayout,
  PageMargins,
  PageOrientation,
  PageSetup,
  PaperSize,
  findPaperSize,
  fitMargins,
  marginPresetOf,
  mmToUnits,
  normalizePageSetup,
  pageDimensions,
  samePageSetup,
  unitsToMm,
} from '@inkframe-ui/editor/core';

export interface PageSetupDialogData {
  /** The document's page setup, or null when it has none. */
  current: PageSetup | null;
  /**
   * The setup for new documents. A document without page setup starts from
   * it (keeping its Pageless layout), and "Set as default" replaces it.
   */
  defaultSetup: PageSetup;
  /** Saves a new default; without it, "Set as default" is not shown. */
  setDefault?: (setup: PageSetup) => void;
}

type Side = keyof PageMargins;

const SIDES: readonly { key: Side; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

/** The preview's box, in pixels; the sheet is scaled to fit it. */
const PREVIEW_BOX = { width: 132, height: 164 };

const draftsFor = (margins: PageMargins, units: PaperSize['units']): Record<Side, string> => ({
  top: String(mmToUnits(margins.top, units)),
  right: String(mmToUnits(margins.right, units)),
  bottom: String(mmToUnits(margins.bottom, units)),
  left: String(mmToUnits(margins.left, units)),
});

/** A paper size with its dimensions, for example "A4 · 21 × 29.7 cm". */
const paperOption = (paper: PaperSize) =>
  `${paper.label} · ${mmToUnits(paper.width, paper.units)} × ${mmToUnits(paper.height, paper.units)} ${paper.units}`;

/**
 * The Page setup dialog: layout, paper size, orientation and margins. Opened
 * by `<ink-editor>` with the CDK Dialog; closes with the new setup, or with
 * nothing when the user cancels or changed nothing.
 */
@Component({
  selector: 'ink-page-setup-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="ink-ps" novalidate (submit)="apply($event)">
      <header class="ink-ps-header">
        <h2 id="ink-page-setup-title" class="ink-ps-title">Page setup</h2>
        <button type="button" class="ink-ps-close" aria-label="Close" (click)="cancel()">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="ink-ps-body">
        <fieldset class="ink-ps-group">
          <legend class="ink-ps-legend">Layout</legend>
          <div class="ink-ps-layouts">
            <label class="ink-ps-layout" [class.is-checked]="layout() === 'pageless'">
              <input
                type="radio"
                name="ink-ps-layout"
                value="pageless"
                [checked]="layout() === 'pageless'"
                (change)="setLayout('pageless')"
              />
              <span class="ink-ps-art ink-ps-art-pageless" aria-hidden="true"><span></span></span>
              <span class="ink-ps-layout-text">
                <span class="ink-ps-layout-name">Pageless</span>
                <span class="ink-ps-layout-hint"
                  >Fills the window. Made for reading on screen.</span
                >
              </span>
            </label>
            <label class="ink-ps-layout" [class.is-checked]="layout() === 'pages'">
              <input
                type="radio"
                name="ink-ps-layout"
                value="pages"
                [checked]="layout() === 'pages'"
                (change)="setLayout('pages')"
              />
              <span class="ink-ps-art ink-ps-art-pages" aria-hidden="true"><span></span></span>
              <span class="ink-ps-layout-text">
                <span class="ink-ps-layout-name">Pages</span>
                <span class="ink-ps-layout-hint"
                  >Real paper size and margins. Prints as it looks.</span
                >
              </span>
            </label>
          </div>
        </fieldset>

        @if (layout() === 'pages') {
          <div class="ink-ps-pages">
            <div class="ink-ps-fields">
              <div class="ink-ps-group">
                <label class="ink-ps-legend" for="ink-ps-paper">Paper size</label>
                <select
                  id="ink-ps-paper"
                  class="ink-ps-select"
                  [value]="paper()"
                  (change)="setPaper($any($event.target).value)"
                >
                  @for (option of papers; track option.id) {
                    <option [value]="option.id" [selected]="option.id === paper()">
                      {{ option.text }}
                    </option>
                  }
                </select>
              </div>

              <fieldset class="ink-ps-group">
                <legend class="ink-ps-legend">Orientation</legend>
                <div class="ink-ps-segmented">
                  <label [class.is-checked]="orientation() === 'portrait'">
                    <input
                      type="radio"
                      name="ink-ps-orientation"
                      value="portrait"
                      [checked]="orientation() === 'portrait'"
                      (change)="setOrientation('portrait')"
                    />
                    <span>Portrait</span>
                  </label>
                  <label [class.is-checked]="orientation() === 'landscape'">
                    <input
                      type="radio"
                      name="ink-ps-orientation"
                      value="landscape"
                      [checked]="orientation() === 'landscape'"
                      (change)="setOrientation('landscape')"
                    />
                    <span>Landscape</span>
                  </label>
                </div>
              </fieldset>

              <fieldset class="ink-ps-group">
                <legend class="ink-ps-legend">
                  Margins
                  @if (!preset() && !marginError()) {
                    <span class="ink-ps-legend-note">· Custom</span>
                  }
                </legend>
                <div class="ink-ps-segmented">
                  @for (option of presets; track option.id) {
                    <label [class.is-checked]="preset() === option.id">
                      <input
                        type="radio"
                        name="ink-ps-margins"
                        [value]="option.id"
                        [checked]="preset() === option.id"
                        (change)="setPreset(option)"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                  }
                </div>
                <div class="ink-ps-margins">
                  @for (side of sides; track side.key) {
                    <label class="ink-ps-margin">
                      <span class="ink-ps-margin-label">{{ side.label }}</span>
                      <span class="ink-ps-input">
                        <input
                          type="number"
                          inputmode="decimal"
                          min="0"
                          [step]="units() === 'in' ? 0.05 : 0.1"
                          [value]="drafts()[side.key]"
                          [attr.aria-invalid]="marginError() ? true : null"
                          [attr.aria-describedby]="marginError() ? 'ink-ps-margin-error' : null"
                          (input)="setMargin(side.key, $any($event.target).value)"
                        />
                        <span class="ink-ps-unit" aria-hidden="true">{{ units() }}</span>
                      </span>
                    </label>
                  }
                </div>
                @if (marginError(); as error) {
                  <p id="ink-ps-margin-error" class="ink-ps-error">{{ error }}</p>
                }
              </fieldset>
            </div>

            <div class="ink-ps-preview" aria-hidden="true">
              <div
                class="ink-ps-sheet"
                [style.width.px]="preview().width"
                [style.height.px]="preview().height"
              >
                <div
                  class="ink-ps-text"
                  [style.top.%]="preview().top"
                  [style.right.%]="preview().right"
                  [style.bottom.%]="preview().bottom"
                  [style.left.%]="preview().left"
                ></div>
              </div>
            </div>
          </div>
        } @else {
          <p class="ink-ps-note">Printing uses the paper size you choose in the print dialog.</p>
        }
      </div>

      <footer class="ink-ps-footer">
        @if (canSetDefault) {
          <button
            type="button"
            class="ink-ps-btn ink-ps-btn-quiet"
            [disabled]="!result()"
            (click)="setAsDefault()"
          >
            Set as default
          </button>
        }
        <span class="ink-ps-status" role="status">{{
          defaultSaved() ? 'Saved as the default for new documents' : ''
        }}</span>
        <div class="ink-ps-actions">
          <button type="button" class="ink-ps-btn" (click)="cancel()">Cancel</button>
          <button type="submit" class="ink-ps-btn ink-ps-btn-primary" [disabled]="!result()">
            Apply
          </button>
        </div>
      </footer>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }

    .ink-ps {
      display: flex;
      flex-direction: column;
      max-height: inherit;
      background: var(--ink-bg-popover, #242423);
      color: var(--ink-text-primary, #f0efec);
      border-radius: 16px;
      box-shadow: var(--ink-shadow-popover, 0 6px 20px rgba(0, 0, 0, 0.4));
      font-size: 14px;
      line-height: 1.45;
      overflow: hidden;
    }

    .ink-ps-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 20px 4px 24px;
    }

    .ink-ps-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--ink-text-heading, #faf9f6);
    }

    .ink-ps-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--ink-text-muted, #9a9891);
      cursor: pointer;

      svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
      }

      &:hover {
        background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
        color: var(--ink-text-primary, #f0efec);
      }
    }

    .ink-ps-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 12px 24px 20px;
    }

    .ink-ps-group {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .ink-ps-group + .ink-ps-group {
      margin-top: 16px;
    }

    .ink-ps-legend {
      display: block;
      padding: 0;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-text-secondary, #c3c2b7);
    }

    .ink-ps-legend-note {
      font-weight: 400;
      color: var(--ink-text-muted, #9a9891);
    }

    /* Native radios stay in the tab order and keep arrow-key selection; they are drawn as cards. */
    input[type='radio'] {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
    }

    .ink-ps-layouts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .ink-ps-layout {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 10px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;

      &:hover {
        background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
      }

      &.is-checked {
        border-color: var(--ink-active-border, rgba(88, 170, 166, 0.32));
        background: var(--ink-active-bg, rgba(2, 131, 128, 0.22));
      }

      &:has(input:focus-visible) {
        outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        outline-offset: 2px;
      }
    }

    .ink-ps-layout-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .ink-ps-layout-name {
      font-weight: 600;
    }

    .ink-ps-layout-hint {
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    /* Small drawings of each layout: lines of text across the window, or inside a page's margins. */
    .ink-ps-art {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 44px;
      border-radius: 6px;
      background: var(--ink-bg-subtle, #262625);

      > span {
        display: block;
        background-color: var(--ink-bg-page, #1e1e1d);
        background-image: repeating-linear-gradient(
          to bottom,
          var(--ink-text-muted, #9a9891) 0 2px,
          transparent 2px 6px
        );
        background-repeat: no-repeat;
        opacity: 0.9;
      }
    }

    .ink-ps-art-pageless > span {
      width: calc(100% - 16px);
      height: 30px;
      background-size: calc(100% - 16px) 20px;
      background-position: 8px 6px;
      border-radius: 3px;
    }

    .ink-ps-art-pages > span {
      width: 26px;
      height: 34px;
      background-size: 16px 22px;
      background-position: 5px 6px;
      border-radius: 2px;
      box-shadow: 0 0 0 1px var(--ink-border-default, #2a2a29);
    }

    .ink-ps-layout.is-checked .ink-ps-art > span {
      background-image: repeating-linear-gradient(
        to bottom,
        var(--ink-active-text, #58aaa6) 0 2px,
        transparent 2px 6px
      );
    }

    .ink-ps-pages {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      margin-top: 18px;
    }

    .ink-ps-select {
      width: 100%;
      height: 36px;
      padding: 0 10px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 8px;
      background: var(--ink-bg-input, #1e1e1d);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .ink-ps-segmented {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 8px;
      background: var(--ink-bg-input, #1e1e1d);

      > label {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 30px;
        padding: 0 12px;
        border-radius: 6px;
        color: var(--ink-text-secondary, #c3c2b7);
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
        }

        &.is-checked {
          background: var(--ink-active-bg, rgba(2, 131, 128, 0.22));
          color: var(--ink-active-text, #58aaa6);
          font-weight: 600;
        }

        &:has(input:focus-visible) {
          outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
          outline-offset: 1px;
        }
      }
    }

    .ink-ps-margins {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 12px;
      margin-top: 12px;
    }

    .ink-ps-margin {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .ink-ps-margin-label {
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-input {
      display: flex;
      align-items: center;
      height: 36px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 8px;
      background: var(--ink-bg-input, #1e1e1d);

      &:focus-within {
        outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        outline-offset: 1px;
      }

      &:has(input[aria-invalid='true']) {
        border-color: var(--ink-danger, #ef4444);
      }

      input {
        flex: 1 1 auto;
        min-width: 0;
        height: 100%;
        padding: 0 4px 0 10px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-variant-numeric: tabular-nums;
        outline: none;
      }
    }

    .ink-ps-unit {
      padding-right: 10px;
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-error {
      margin: 8px 0 0;
      font-size: 12px;
      color: var(--ink-danger-text, #f87171);
    }

    .ink-ps-note {
      margin: 14px 0 0;
      font-size: 13px;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 148px;
      height: 180px;
      align-self: start;
      margin-top: 24px;
      border-radius: 10px;
      background: var(--ink-bg-subtle, #262625);
    }

    .ink-ps-sheet {
      position: relative;
      background: var(--ink-bg-page, #1e1e1d);
      box-shadow:
        0 0 0 1px var(--ink-border-default, #2a2a29),
        var(--ink-shadow-page, none);
      transition:
        width 0.18s ease,
        height 0.18s ease;
    }

    .ink-ps-text {
      position: absolute;
      background-image: repeating-linear-gradient(
        to bottom,
        var(--ink-text-muted, #9a9891) 0 1.5px,
        transparent 1.5px 5px
      );
      opacity: 0.55;
      outline: 1px dashed var(--ink-active-border, rgba(88, 170, 166, 0.32));
      transition: inset 0.18s ease;
    }

    .ink-ps-footer {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 24px 18px;
      border-top: 1px solid var(--ink-border-default, #2a2a29);
    }

    .ink-ps-status {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-actions {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }

    .ink-ps-btn {
      height: 36px;
      padding: 0 14px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 8px;
      background: transparent;
      color: var(--ink-text-primary, #f0efec);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .ink-ps-btn-quiet {
      border-color: transparent;
      padding: 0 8px;
      color: var(--ink-active-text, #58aaa6);
    }

    .ink-ps-btn-primary {
      border-color: transparent;
      background: var(--ink-accent-primary, #028380);
      color: #fff;

      &:hover:not(:disabled) {
        background: var(--ink-accent-hover, #08726f);
      }
    }

    .ink-ps-close,
    .ink-ps-btn,
    .ink-ps-select {
      &:focus-visible {
        outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        outline-offset: 2px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ink-ps-sheet,
      .ink-ps-text,
      .ink-ps-layout {
        transition: none;
      }
    }

    /* Phones: one column, no preview (the margins are listed in the fields). */
    @media (max-width: 539px) {
      .ink-ps-header {
        padding: 14px 12px 2px 20px;
      }
      .ink-ps-body {
        padding: 10px 20px 16px;
      }
      .ink-ps-pages {
        grid-template-columns: minmax(0, 1fr);
      }
      .ink-ps-preview {
        display: none;
      }
      .ink-ps-footer {
        flex-wrap: wrap;
        padding: 12px 20px max(16px, env(safe-area-inset-bottom));
      }
      .ink-ps-status:empty {
        display: none;
      }
    }

    @media (pointer: coarse) {
      .ink-ps-close,
      .ink-ps-btn,
      .ink-ps-select,
      .ink-ps-input {
        min-height: 44px;
      }
      .ink-ps-close {
        width: 44px;
      }
      .ink-ps-segmented > label {
        height: 40px;
      }
    }
  `,
})
export class PageSetupDialog {
  private readonly ref = inject<DialogRef<PageSetup, PageSetupDialog>>(DialogRef);
  private readonly data = inject<PageSetupDialogData>(DIALOG_DATA);

  protected readonly papers = PAPER_SIZES.map((p) => ({ id: p.id, text: paperOption(p) }));
  protected readonly presets = MARGIN_PRESETS;
  protected readonly sides = SIDES;
  protected readonly canSetDefault = !!this.data.setDefault;

  /** What the dialog starts from: a document without page setup keeps its Pageless layout. */
  private readonly initial: PageSetup = this.data.current ?? {
    ...this.data.defaultSetup,
    layout: 'pageless',
  };

  protected readonly layout = signal<PageLayout>(this.initial.layout);
  protected readonly paper = signal(this.initial.paper);
  protected readonly orientation = signal<PageOrientation>(this.initial.orientation);
  protected readonly units = computed(() => findPaperSize(this.paper()).units);
  /** The margin fields' text, in the paper's units. */
  protected readonly drafts = signal(
    draftsFor(this.initial.margins, findPaperSize(this.initial.paper).units),
  );
  protected readonly defaultSaved = signal(false);

  /** The margins the fields describe, in millimeters; null while one is not a number ≥ 0. */
  private readonly margins = computed<PageMargins | null>(() => {
    const drafts = this.drafts();
    const units = this.units();
    const margins = {} as PageMargins;
    for (const { key } of SIDES) {
      const text = drafts[key].trim();
      const value = Number(text);
      if (text === '' || !Number.isFinite(value) || value < 0) return null;
      margins[key] = unitsToMm(value, units);
    }
    return margins;
  });

  protected readonly marginError = computed(() => {
    const margins = this.margins();
    if (!margins) return 'Enter each margin as a number, 0 or more.';
    const { width, height } = pageDimensions({
      paper: this.paper(),
      orientation: this.orientation(),
    });
    const room = (side: number, a: number, b: number) => side - a - b >= MIN_TEXT_AREA_MM - 0.01;
    if (room(width, margins.left, margins.right) && room(height, margins.top, margins.bottom)) {
      return null;
    }
    const min = this.units() === 'in' ? '2 in' : '5 cm';
    return `The margins leave too little room. Keep at least ${min} of text width and height.`;
  });

  protected readonly preset = computed(() => {
    const margins = this.margins();
    return margins ? marginPresetOf(margins) : null;
  });

  /** The page, scaled into the preview box, and its text area as percentages. */
  protected readonly preview = computed(() => {
    const { width, height } = pageDimensions({
      paper: this.paper(),
      orientation: this.orientation(),
    });
    const scale = Math.min(PREVIEW_BOX.width / width, PREVIEW_BOX.height / height);
    const m = this.margins() ?? this.initial.margins;
    const pct = (value: number, of: number) => Math.min(45, (value / of) * 100);
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      top: pct(m.top, height),
      right: pct(m.right, width),
      bottom: pct(m.bottom, height),
      left: pct(m.left, width),
    };
  });

  /** The setup the fields describe, or null while the margins are not valid. */
  protected readonly result = computed<PageSetup | null>(() => {
    const margins = this.margins();
    if (!margins || this.marginError()) return null;
    return normalizePageSetup({
      ...this.initial,
      layout: this.layout(),
      paper: this.paper(),
      orientation: this.orientation(),
      margins,
    });
  });

  protected setLayout(layout: PageLayout): void {
    this.layout.set(layout);
    this.defaultSaved.set(false);
  }

  protected setPaper(paper: string): void {
    // Read the margins first: the fields are in the old paper's units.
    const margins = this.margins() ?? this.initial.margins;
    this.paper.set(paper);
    this.showMargins(margins);
  }

  protected setOrientation(orientation: PageOrientation): void {
    const margins = this.margins() ?? this.initial.margins;
    this.orientation.set(orientation);
    this.showMargins(margins);
  }

  protected setPreset(preset: MarginPreset): void {
    this.showMargins(preset.margins);
  }

  protected setMargin(side: Side, text: string): void {
    this.drafts.update((drafts) => ({ ...drafts, [side]: text }));
    this.defaultSaved.set(false);
  }

  protected setAsDefault(): void {
    const setup = this.result();
    if (!setup) return;
    this.data.setDefault?.(setup);
    this.defaultSaved.set(true);
  }

  protected apply(event: Event): void {
    event.preventDefault();
    const setup = this.result();
    if (!setup) return;
    const unchanged = samePageSetup(setup, normalizePageSetup(this.initial));
    this.ref.close(unchanged ? undefined : setup);
  }

  protected cancel(): void {
    this.ref.close();
  }

  /**
   * Shows margins in the fields, in the paper's units. Margins that do not
   * fit the page (after the paper or orientation changed) are scaled down.
   */
  private showMargins(margins: PageMargins): void {
    const fitted = fitMargins(margins, { paper: this.paper(), orientation: this.orientation() });
    this.drafts.set(draftsFor(fitted, this.units()));
    this.defaultSaved.set(false);
  }
}
