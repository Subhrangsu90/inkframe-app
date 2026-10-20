import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  MARGIN_PRESETS,
  MAX_MARGIN_TEXT,
  MIN_MARGIN_TEXT_MARGIN_MM,
  MIN_TEXT_AREA_MM,
  MarginLine,
  MarginPreset,
  MarginText,
  MarginTextAlign,
  PAGE_COLORS,
  PAPER_SIZES,
  PageLayout,
  PageMargins,
  PageNumbers,
  PageOrientation,
  PageSetup,
  PaperSize,
  findPaperSize,
  fitMargins,
  marginPresetOf,
  mmToUnits,
  normalizePageSetup,
  pageDimensions,
  pageMarginLines,
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
  /** Opens the dialog at the header or footer field instead of its first tab. */
  section?: 'header' | 'footer' | null;
}

type Side = keyof PageMargins;

const SIDES: readonly { key: Side; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

type Band = 'header' | 'footer';

const BANDS: readonly { key: Band; label: string }[] = [
  { key: 'header', label: 'Header' },
  { key: 'footer', label: 'Footer' },
];

const ALIGNS: readonly { value: MarginTextAlign; label: string; path: string }[] = [
  { value: 'left', label: 'Left', path: 'M4 6h16M4 12h10M4 18h13' },
  { value: 'center', label: 'Center', path: 'M4 6h16M7 12h10M5.5 18h13' },
  { value: 'right', label: 'Right', path: 'M4 6h16M10 12h10M7 18h13' },
];

const NUMBER_POSITIONS: readonly { value: PageNumbers['position']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

type Tab = 'page' | 'margins' | 'bands';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'page', label: 'Page' },
  { key: 'margins', label: 'Margins' },
  { key: 'bands', label: 'Header & footer' },
];

/** The preview's box, in pixels; the sheet is scaled to fit it. */
const PREVIEW_BOX = { width: 196, height: 244 };

/** The page the preview shows: its number, and the document's length. */
const PREVIEW_PAGE = { page: 1, pages: 12 };

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
 * The Page setup dialog. A live preview of the page sits on the left; on the
 * right, the layout's settings in three tabs: the paper and its color, the
 * margins, and the header, footer and page numbers. Opened by `<ink-editor>`
 * with the CDK Dialog; closes with the new setup, or with nothing when the
 * user cancels or changed nothing.
 */
@Component({
  selector: 'ink-page-setup-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="ink-ps"
      [class.is-pages]="layout() === 'pages'"
      novalidate
      (submit)="apply($event)"
    >
      <header class="ink-ps-header">
        <h2 id="ink-page-setup-title" class="ink-ps-title">Page setup</h2>
        <button type="button" class="ink-ps-close" aria-label="Close" (click)="cancel()">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <aside class="ink-ps-stage">
        <fieldset class="ink-ps-group ink-ps-mode">
          <legend class="ink-ps-sr">Layout</legend>
          <div class="ink-ps-segmented ink-ps-segmented-fill">
            <label [class.is-checked]="layout() === 'pages'">
              <input
                type="radio"
                name="ink-ps-layout"
                value="pages"
                [checked]="layout() === 'pages'"
                (change)="setLayout('pages')"
              />
              <span>Pages</span>
            </label>
            <label [class.is-checked]="layout() === 'pageless'">
              <input
                type="radio"
                name="ink-ps-layout"
                value="pageless"
                [checked]="layout() === 'pageless'"
                (change)="setLayout('pageless')"
              />
              <span>Pageless</span>
            </label>
          </div>
        </fieldset>

        <div class="ink-ps-preview" aria-hidden="true">
          @if (layout() === 'pages') {
            <div
              class="ink-ps-sheet"
              [style]="colorStyle()"
              [style.width.px]="preview().width"
              [style.height.px]="preview().height"
            >
              @if (zone(); as zone) {
                <div class="ink-ps-zone" [style]="zone"></div>
              }
              <div
                class="ink-ps-text"
                [style.top.%]="preview().top"
                [style.right.%]="preview().right"
                [style.bottom.%]="preview().bottom"
                [style.left.%]="preview().left"
              ></div>
              @for (band of previewBands(); track band.edge) {
                <div
                  class="ink-ps-band"
                  [class.is-balanced]="band.balanced"
                  [class.is-top]="band.edge === 'top'"
                  [style.height.%]="band.edge === 'top' ? preview().top : preview().bottom"
                  [style.left.%]="preview().left"
                  [style.right.%]="preview().right"
                >
                  <span class="ink-ps-slot" [class.is-empty]="!band.line.left">{{
                    band.line.left
                  }}</span>
                  <span
                    class="ink-ps-slot ink-ps-slot-center"
                    [class.is-empty]="!band.line.center"
                    >{{ band.line.center }}</span
                  >
                  <span class="ink-ps-slot ink-ps-slot-right" [class.is-empty]="!band.line.right">{{
                    band.line.right
                  }}</span>
                </div>
              }
            </div>
          } @else {
            <div class="ink-ps-window" [style]="colorStyle()">
              <span class="ink-ps-window-bar"><i></i><i></i><i></i></span>
              <span class="ink-ps-window-text"></span>
            </div>
          }
        </div>

        <p class="ink-ps-caption">
          @if (layout() === 'pages') {
            <span class="ink-ps-caption-title">{{ sizeLabel() }}</span>
            <span>{{ sizeDetail() }}</span>
          } @else {
            <span class="ink-ps-caption-title">Pageless</span>
            <span>Fills the window. Made for reading on screen.</span>
          }
        </p>
      </aside>

      <div class="ink-ps-content">
        @if (layout() === 'pages') {
          <div class="ink-ps-tabs" role="tablist" aria-label="Page setup sections">
            @for (item of tabs; track item.key) {
              <button
                type="button"
                role="tab"
                class="ink-ps-tab"
                [id]="'ink-ps-tab-' + item.key"
                [attr.aria-selected]="tab() === item.key"
                aria-controls="ink-ps-panel"
                [attr.tabindex]="tab() === item.key ? 0 : -1"
                (click)="tab.set(item.key)"
                (keydown)="onTabKey($event)"
              >
                {{ item.label }}
                @if (item.key === 'margins' && marginError()) {
                  <span class="ink-ps-tab-alert" aria-hidden="true"></span>
                  <span class="ink-ps-sr">(needs a fix)</span>
                }
              </button>
            }
          </div>
        }

        <div
          class="ink-ps-panel"
          [attr.id]="layout() === 'pages' ? 'ink-ps-panel' : null"
          [attr.role]="layout() === 'pages' ? 'tabpanel' : null"
          [attr.aria-labelledby]="layout() === 'pages' ? 'ink-ps-tab-' + tab() : null"
        >
          @if (layout() === 'pages') {
            @switch (tab()) {
              @case ('page') {
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
                  <div class="ink-ps-segmented ink-ps-segmented-fill">
                    <label [class.is-checked]="orientation() === 'portrait'">
                      <input
                        type="radio"
                        name="ink-ps-orientation"
                        value="portrait"
                        [checked]="orientation() === 'portrait'"
                        (change)="setOrientation('portrait')"
                      />
                      <span class="ink-ps-glyph ink-ps-glyph-portrait" aria-hidden="true"></span>
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
                      <span class="ink-ps-glyph ink-ps-glyph-landscape" aria-hidden="true"></span>
                      <span>Landscape</span>
                    </label>
                  </div>
                </fieldset>
              }

              @case ('margins') {
                <fieldset class="ink-ps-group">
                  <legend class="ink-ps-legend">
                    Preset
                    @if (!preset() && !marginError()) {
                      <span class="ink-ps-legend-note">· Custom</span>
                    }
                  </legend>
                  <div class="ink-ps-segmented ink-ps-segmented-fill">
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
                </fieldset>

                <fieldset class="ink-ps-group">
                  <legend class="ink-ps-legend">Sizes</legend>
                  <div class="ink-ps-margins">
                    @for (side of sides; track side.key) {
                      <label class="ink-ps-margin">
                        <span class="ink-ps-field-label">{{ side.label }}</span>
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
                            (focus)="focused.set(side.key)"
                            (blur)="focused.set(null)"
                          />
                          <span class="ink-ps-unit" aria-hidden="true">{{ units() }}</span>
                        </span>
                      </label>
                    }
                  </div>
                  @if (marginError(); as error) {
                    <p id="ink-ps-margin-error" class="ink-ps-error">{{ error }}</p>
                  } @else {
                    @if (edgeWarning(); as warning) {
                      <p class="ink-ps-note ink-ps-margin-note">{{ warning }}</p>
                    }
                  }
                </fieldset>
              }

              @case ('bands') {
                @for (band of bands; track band.key) {
                  <div class="ink-ps-group">
                    <label class="ink-ps-legend" [for]="'ink-ps-' + band.key">{{
                      band.label
                    }}</label>
                    <div class="ink-ps-row">
                      <span class="ink-ps-input ink-ps-text-input">
                        <input
                          type="text"
                          [id]="'ink-ps-' + band.key"
                          [maxLength]="maxText"
                          placeholder="None"
                          autocomplete="off"
                          [value]="marginText()[band.key].text"
                          (input)="setMarginText(band.key, { text: $any($event.target).value })"
                          (focus)="focused.set(band.key)"
                          (blur)="focused.set(null)"
                        />
                      </span>
                      <div
                        class="ink-ps-segmented ink-ps-segmented-icons"
                        role="radiogroup"
                        [attr.aria-label]="band.label + ' alignment'"
                      >
                        @for (align of aligns; track align.value) {
                          <label
                            [class.is-checked]="marginText()[band.key].align === align.value"
                            [title]="align.label"
                          >
                            <input
                              type="radio"
                              [name]="'ink-ps-' + band.key + '-align'"
                              [value]="align.value"
                              [checked]="marginText()[band.key].align === align.value"
                              (change)="setMarginText(band.key, { align: align.value })"
                            />
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                              <path [attr.d]="align.path" />
                            </svg>
                            <span class="ink-ps-sr">{{ align.label }}</span>
                          </label>
                        }
                      </div>
                    </div>
                  </div>
                }

                <fieldset class="ink-ps-group">
                  <legend class="ink-ps-legend">Page numbers</legend>
                  <div class="ink-ps-segmented ink-ps-segmented-fill">
                    @for (option of numberPositions; track option.value) {
                      <label [class.is-checked]="numbers().position === option.value">
                        <input
                          type="radio"
                          name="ink-ps-numbers"
                          [value]="option.value"
                          [checked]="numbers().position === option.value"
                          (change)="setNumbers({ position: option.value })"
                        />
                        <span>{{ option.label }}</span>
                      </label>
                    }
                  </div>
                  @if (numbers().position !== 'none') {
                    <div class="ink-ps-row ink-ps-numbers-row">
                      <select
                        class="ink-ps-select"
                        aria-label="Page number format"
                        (change)="setNumbers({ format: $any($event.target).value })"
                      >
                        <option value="number" [selected]="numbers().format === 'number'">3</option>
                        <option value="page-of" [selected]="numbers().format === 'page-of'">
                          Page 3 of 12
                        </option>
                      </select>
                      <div
                        class="ink-ps-segmented ink-ps-segmented-icons"
                        role="radiogroup"
                        aria-label="Page number alignment"
                      >
                        @for (align of aligns; track align.value) {
                          <label
                            [class.is-checked]="numbers().align === align.value"
                            [title]="align.label"
                          >
                            <input
                              type="radio"
                              name="ink-ps-numbers-align"
                              [value]="align.value"
                              [checked]="numbers().align === align.value"
                              (change)="setNumbers({ align: align.value })"
                            />
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                              <path [attr.d]="align.path" />
                            </svg>
                            <span class="ink-ps-sr">{{ align.label }}</span>
                          </label>
                        }
                      </div>
                    </div>
                  }
                </fieldset>

                @if (hasMarginText()) {
                  <label class="ink-ps-check ink-ps-first-page">
                    <input
                      type="checkbox"
                      [checked]="firstPage()"
                      (change)="setFirstPage($any($event.target).checked)"
                    />
                    <span>Show on the first page</span>
                  </label>
                }
                @if (edgeWarning(); as warning) {
                  <p class="ink-ps-note ink-ps-band-note">{{ warning }}</p>
                }
              }
            }
          }

          <!-- The page color: on the Page tab, and alone in Pageless. -->
          @if (layout() === 'pageless' || tab() === 'page') {
            <fieldset class="ink-ps-group">
              <legend class="ink-ps-legend">
                Page color
                <span class="ink-ps-legend-note">· {{ colorLabel() }}</span>
              </legend>
              <div class="ink-ps-colors">
                <label
                  class="ink-ps-swatch ink-ps-swatch-none"
                  [class.is-checked]="!color()"
                  title="None"
                >
                  <input
                    type="radio"
                    name="ink-ps-color"
                    value=""
                    [checked]="!color()"
                    (change)="setColor(null)"
                  />
                  <span class="ink-ps-sr">None</span>
                </label>
                @for (option of colors; track option.name) {
                  <label
                    class="ink-ps-swatch"
                    [class.is-checked]="color() === option.name"
                    [style]="option.style"
                    [title]="option.label"
                  >
                    <input
                      type="radio"
                      name="ink-ps-color"
                      [value]="option.name"
                      [checked]="color() === option.name"
                      (change)="setColor(option.name)"
                    />
                    <span class="ink-ps-sr">{{ option.label }}</span>
                  </label>
                }
              </div>
              @if (color()) {
                <label class="ink-ps-check">
                  <input
                    type="checkbox"
                    [checked]="printColor()"
                    (change)="setPrintColor($any($event.target).checked)"
                  />
                  <span>Print page color</span>
                </label>
              }
            </fieldset>
          }
          @if (layout() === 'pageless') {
            <p class="ink-ps-note">Printing uses the paper size you choose in the print dialog.</p>
          }
        </div>
      </div>

      <footer class="ink-ps-footer">
        @if (canSetDefault) {
          <button
            type="button"
            class="ink-ps-btn ink-ps-btn-quiet"
            [disabled]="!result()"
            (click)="setAsDefault()"
          >
            @if (defaultSaved()) {
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Saved as default
            } @else {
              Set as default
            }
          </button>
        }
        <span class="ink-ps-sr" role="status">{{
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

    /*
     * Two columns: the preview on the left, the full height of the dialog;
     * the title, the settings and the actions on the right.
     */
    .ink-ps {
      display: grid;
      grid-template-columns: 264px minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'stage header'
        'stage content'
        'stage footer';
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
      grid-area: header;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 14px 6px 24px;
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

    /* ── The preview ─────────────────────────────────────────── */

    .ink-ps-stage {
      grid-area: stage;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
      background: var(--ink-bg-app, #151515);
      border-right: 1px solid var(--ink-border-default, #2a2a29);
    }

    .ink-ps-preview {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 264px;
    }

    .ink-ps-sheet,
    .ink-ps-window {
      /* The page color as the page shows it in the current theme. */
      --ink-swatch: var(--ink-swatch-dark, var(--ink-bg-page, #1e1e1d));
      position: relative;
      background: var(--ink-swatch);
      box-shadow:
        0 0 0 1px var(--ink-border-default, #2a2a29),
        0 8px 24px rgba(0, 0, 0, 0.18);
      transition:
        width 0.18s ease,
        height 0.18s ease,
        background-color 0.18s ease;
    }

    :host-context(.theme-light) .ink-ps-sheet,
    :host-context(.theme-light) .ink-ps-window,
    :host-context(.theme-light) .ink-ps-swatch,
    :host-context([data-theme='light']) .ink-ps-sheet,
    :host-context([data-theme='light']) .ink-ps-window,
    :host-context([data-theme='light']) .ink-ps-swatch {
      --ink-swatch: var(--ink-swatch-light, var(--ink-bg-page, #ffffff));
    }

    .ink-ps-sheet {
      border-radius: 2px;
    }

    /* The margin being edited. */
    .ink-ps-zone {
      position: absolute;
      background: color-mix(in srgb, var(--ink-active-text, #58aaa6) 22%, transparent);
    }

    .ink-ps-text {
      position: absolute;
      background-image: repeating-linear-gradient(
        to bottom,
        color-mix(in srgb, var(--ink-text-muted, #9a9891) 38%, transparent) 0 1.5px,
        transparent 1.5px 6.5px
      );
      outline: 1px dashed var(--ink-active-border, rgba(88, 170, 166, 0.32));
      transition: inset 0.18s ease;
    }

    /* A header or footer, centered in its margin, as on the page. */
    .ink-ps-band {
      position: absolute;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 7px;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      color: var(--ink-text-secondary, #c3c2b7);
      transition:
        height 0.18s ease,
        left 0.18s ease,
        right 0.18s ease;

      &.is-top {
        top: 0;
        bottom: auto;
      }
    }

    .ink-ps-slot {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.is-empty {
        flex: 0 0 0;
      }

      .is-balanced > &.is-empty {
        flex: 1 1 0;
      }
    }

    .ink-ps-slot-center {
      text-align: center;
    }

    .ink-ps-slot-right {
      text-align: right;
    }

    /* Pageless: a window, its text across the width. */
    .ink-ps-window {
      display: flex;
      flex-direction: column;
      width: 212px;
      height: 148px;
      border-radius: 6px;
      overflow: hidden;
    }

    .ink-ps-window-bar {
      display: flex;
      gap: 3px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--ink-border-default, #2a2a29);

      i {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--ink-text-muted, #9a9891);
        opacity: 0.5;
      }
    }

    .ink-ps-window-text {
      flex: 1 1 auto;
      margin: 12px 18px;
      background-image: repeating-linear-gradient(
        to bottom,
        color-mix(in srgb, var(--ink-text-muted, #9a9891) 38%, transparent) 0 1.5px,
        transparent 1.5px 7px
      );
    }

    .ink-ps-caption {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      font-size: 12px;
      text-align: center;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-caption-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink-text-primary, #f0efec);
    }

    /* ── Settings ────────────────────────────────────────────── */

    .ink-ps-content {
      grid-area: content;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .ink-ps-tabs {
      display: flex;
      gap: 4px;
      padding: 0 24px;
      border-bottom: 1px solid var(--ink-border-default, #2a2a29);
    }

    .ink-ps-tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 10px;
      margin-bottom: -1px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--ink-text-muted, #9a9891);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;

      &:first-child {
        margin-left: -10px;
      }

      &:hover {
        color: var(--ink-text-primary, #f0efec);
      }

      &[aria-selected='true'] {
        border-bottom-color: var(--ink-active-text, #58aaa6);
        color: var(--ink-text-heading, #faf9f6);
        font-weight: 600;
      }

      &:focus-visible {
        outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        outline-offset: -3px;
        border-radius: 8px 8px 0 0;
      }
    }

    .ink-ps-tab-alert {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ink-danger, #ef4444);
    }

    .ink-ps-panel {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 20px 24px 24px;
    }

    .ink-ps-group {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .ink-ps-group + .ink-ps-group,
    .ink-ps-group + .ink-ps-check,
    .ink-ps-group + .ink-ps-note {
      margin-top: 20px;
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

    .ink-ps-field-label {
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    /* Native radios stay in the tab order and keep arrow-key selection; they are drawn as buttons. */
    input[type='radio'] {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
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
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--ink-border-default, #2a2a29);
      border-radius: 9px;
      background: var(--ink-bg-input, #1e1e1d);

      > label {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 30px;
        padding: 0 12px;
        border-radius: 7px;
        color: var(--ink-text-secondary, #c3c2b7);
        white-space: nowrap;
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--ink-bg-hover, rgba(255, 255, 255, 0.06));
        }

        /* A touch of the heading color keeps the teal above 4.5:1 on its tint in both themes. */
        &.is-checked {
          background: var(--ink-active-bg, rgba(2, 131, 128, 0.22));
          color: color-mix(
            in srgb,
            var(--ink-active-text, #58aaa6) 85%,
            var(--ink-text-heading, #faf9f6)
          );
          font-weight: 600;
        }

        &:has(input:focus-visible) {
          outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
          outline-offset: 1px;
        }
      }
    }

    .ink-ps-segmented-fill {
      display: flex;

      > label {
        flex: 1 1 0;
        min-width: 0;
      }
    }

    .ink-ps-segmented-icons > label {
      width: 32px;
      padding: 0;

      svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
      }
    }

    /* Small paper outlines beside Portrait and Landscape. */
    .ink-ps-glyph {
      flex-shrink: 0;
      border: 1.5px solid currentColor;
      border-radius: 2px;
    }

    .ink-ps-glyph-portrait {
      width: 10px;
      height: 13px;
    }

    .ink-ps-glyph-landscape {
      width: 13px;
      height: 10px;
    }

    .ink-ps-margins {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .ink-ps-margin {
      display: flex;
      flex-direction: column;
      gap: 4px;
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

    .ink-ps-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ink-ps-text-input {
      flex: 1 1 auto;
      min-width: 0;
    }

    .ink-ps-numbers-row {
      margin-top: 10px;

      .ink-ps-select {
        flex: 1 1 auto;
        width: auto;
        min-width: 0;
      }
    }

    .ink-ps-error {
      margin: 10px 0 0;
      font-size: 12px;
      color: var(--ink-danger-text, #f87171);
    }

    .ink-ps-note {
      margin: 14px 0 0;
      font-size: 12px;
      color: var(--ink-text-muted, #9a9891);
    }

    .ink-ps-margin-note {
      margin-top: 10px;
    }

    .ink-ps-colors {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    /* A swatch shows the color as the page will look in the current theme. */
    .ink-ps-swatch {
      --ink-swatch: var(--ink-swatch-dark, var(--ink-bg-page, #1e1e1d));
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--ink-swatch);
      /* A ring that shows on the dialog in both themes (dark page colors are close to it). */
      --ink-swatch-ring: inset 0 0 0 1px
        color-mix(in srgb, var(--ink-text-muted, #9a9891) 55%, transparent);
      box-shadow: var(--ink-swatch-ring);
      cursor: pointer;

      &.is-checked {
        box-shadow:
          var(--ink-swatch-ring),
          0 0 0 2px var(--ink-bg-popover, #242423),
          0 0 0 4px var(--ink-accent-primary, #028380);
      }

      &:has(input:focus-visible) {
        outline: 3px solid var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        outline-offset: 4px;
      }
    }

    /* No color: the theme's page, crossed out. */
    .ink-ps-swatch-none {
      background:
        linear-gradient(
            to top right,
            transparent calc(50% - 1px),
            var(--ink-text-muted, #9a9891) calc(50% - 1px) calc(50% + 1px),
            transparent calc(50% + 1px)
          )
          center / 60% 60% no-repeat,
        var(--ink-swatch);
    }

    .ink-ps-check {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      font-size: 13px;
      cursor: pointer;

      input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--ink-accent-primary, #028380);
        cursor: pointer;
      }
    }

    .ink-ps-colors + .ink-ps-check {
      display: flex;
    }

    .ink-ps-sr {
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

    /* ── Actions ─────────────────────────────────────────────── */

    .ink-ps-footer {
      grid-area: footer;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 24px 16px;
      border-top: 1px solid var(--ink-border-default, #2a2a29);
    }

    .ink-ps-actions {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }

    .ink-ps-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
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

      svg {
        fill: none;
        stroke: currentColor;
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    .ink-ps-btn-quiet {
      border-color: transparent;
      padding: 0 8px;
      margin-left: -8px;
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
      .ink-ps-window,
      .ink-ps-text,
      .ink-ps-band {
        transition: none;
      }
    }

    /* Tall enough screens: the settings keep one height, so switching tabs does not resize the dialog. */
    @media (min-width: 700px) and (min-height: 640px) {
      .ink-ps-content {
        min-height: 400px;
      }
    }

    /* Narrow screens: one column. The layout switch stays; the preview goes. */
    @media (max-width: 699px) {
      .ink-ps {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto minmax(0, 1fr) auto;
        grid-template-areas:
          'header'
          'stage'
          'content'
          'footer';
      }

      .ink-ps-stage {
        padding: 6px 20px 14px;
        background: none;
        border-right: 0;
      }

      .ink-ps-preview,
      .ink-ps-caption {
        display: none;
      }

      .ink-ps-header {
        padding: 14px 12px 2px 20px;
      }

      .ink-ps-tabs {
        padding: 0 20px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      .ink-ps-panel {
        padding: 18px 20px 20px;
      }

      .ink-ps-footer {
        flex-wrap: wrap;
        padding: 12px 20px max(16px, env(safe-area-inset-bottom));
      }
    }

    @media (pointer: coarse) {
      .ink-ps-close,
      .ink-ps-btn,
      .ink-ps-select,
      .ink-ps-input,
      .ink-ps-tab {
        min-height: 44px;
      }
      .ink-ps-close {
        width: 44px;
      }
      .ink-ps-segmented > label {
        height: 40px;
      }
      .ink-ps-segmented-icons > label {
        width: 40px;
      }
    }
  `,
})
export class PageSetupDialog {
  private readonly ref = inject<DialogRef<PageSetup, PageSetupDialog>>(DialogRef);
  private readonly data = inject<PageSetupDialogData>(DIALOG_DATA);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly papers = PAPER_SIZES.map((p) => ({ id: p.id, text: paperOption(p) }));
  protected readonly presets = MARGIN_PRESETS;
  protected readonly sides = SIDES;
  protected readonly colors = PAGE_COLORS.map((c) => ({
    ...c,
    style: { '--ink-swatch-light': c.light, '--ink-swatch-dark': c.dark },
  }));
  protected readonly canSetDefault = !!this.data.setDefault;
  protected readonly maxText = MAX_MARGIN_TEXT;
  protected readonly bands = BANDS;
  protected readonly aligns = ALIGNS;
  protected readonly numberPositions = NUMBER_POSITIONS;
  protected readonly tabs = TABS;

  /** What the dialog starts from: a document without page setup keeps its Pageless layout. */
  private readonly initial: PageSetup = this.data.current ?? {
    ...this.data.defaultSetup,
    layout: 'pageless',
  };

  protected readonly tab = signal<Tab>(this.data.section ? 'bands' : 'page');
  /** The margin or band whose field has focus, drawn on the preview. */
  protected readonly focused = signal<Side | Band | null>(null);

  protected readonly layout = signal<PageLayout>(this.initial.layout);
  protected readonly paper = signal(this.initial.paper);
  protected readonly orientation = signal<PageOrientation>(this.initial.orientation);
  protected readonly color = signal(this.initial.color);
  protected readonly printColor = signal(this.initial.printColor);
  protected readonly colorLabel = computed(
    () => this.colors.find((c) => c.name === this.color())?.label ?? 'None',
  );
  /** The page color for the preview, in both themes; none for the theme's page. */
  protected readonly colorStyle = computed(
    () => this.colors.find((c) => c.name === this.color())?.style ?? {},
  );
  protected readonly marginText = signal<Record<Band, MarginText>>({
    header: this.initial.header,
    footer: this.initial.footer,
  });
  protected readonly numbers = signal<PageNumbers>(this.initial.pageNumbers);
  protected readonly firstPage = signal(this.initial.firstPage);
  protected readonly hasMarginText = computed(
    () =>
      !!this.marginText().header.text ||
      !!this.marginText().footer.text ||
      this.numbers().position !== 'none',
  );
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

  /** Text in a margin this narrow sits where some printers cannot print. */
  protected readonly edgeWarning = computed(() => {
    const margins = this.margins();
    if (!margins) return null;
    const { header, footer } = this.marginText();
    const position = this.numbers().position;
    const top = (!!header.text || position === 'top') && margins.top < MIN_MARGIN_TEXT_MARGIN_MM;
    const bottom =
      (!!footer.text || position === 'bottom') && margins.bottom < MIN_MARGIN_TEXT_MARGIN_MM;
    if (!top && !bottom) return null;
    const min = this.units() === 'in' ? '0.6 in' : '1.5 cm';
    return `Headers and footers sit in the margins. Under ${min}, some printers can't print that close to the paper's edge.`;
  });

  /** The paper and orientation, for example "A4 · Portrait". */
  protected readonly sizeLabel = computed(
    () =>
      `${findPaperSize(this.paper()).label} · ${this.orientation() === 'landscape' ? 'Landscape' : 'Portrait'}`,
  );

  /** The page's size as turned, for example "21 × 29.7 cm". */
  protected readonly sizeDetail = computed(() => {
    const { width, height } = pageDimensions({
      paper: this.paper(),
      orientation: this.orientation(),
    });
    const units = this.units();
    return `${mmToUnits(width, units)} × ${mmToUnits(height, units)} ${units}`;
  });

  /** The page, scaled into the preview box, and its margins as percentages. */
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

  /** The margin whose field has focus, as a box on the preview's sheet. */
  protected readonly zone = computed<Partial<Record<Side | 'width' | 'height', string>> | null>(
    () => {
      const p = this.preview();
      switch (this.focused()) {
        case 'top':
        case 'header':
          return { top: '0', left: '0', right: '0', height: `${p.top}%` };
        case 'bottom':
        case 'footer':
          return { bottom: '0', left: '0', right: '0', height: `${p.bottom}%` };
        case 'left':
          return { top: '0', bottom: '0', left: '0', width: `${p.left}%` };
        case 'right':
          return { top: '0', bottom: '0', right: '0', width: `${p.right}%` };
        default:
          return null;
      }
    },
  );

  /** The preview page's header and footer, as the page draws them. */
  protected readonly previewBands = computed(() => {
    const lines = pageMarginLines(
      {
        ...this.initial,
        layout: 'pages',
        header: this.marginText().header,
        footer: this.marginText().footer,
        pageNumbers: this.numbers(),
        firstPage: true,
      },
      PREVIEW_PAGE.page,
      PREVIEW_PAGE.pages,
    );
    const bands: { edge: 'top' | 'bottom'; line: MarginLine; balanced: boolean }[] = [];
    for (const [edge, line] of [
      ['top', lines.top],
      ['bottom', lines.bottom],
    ] as const) {
      if (line)
        bands.push({ edge, line, balanced: !!line.center && (!!line.left || !!line.right) });
    }
    return bands;
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
      color: this.color(),
      printColor: this.printColor(),
      header: this.marginText().header,
      footer: this.marginText().footer,
      pageNumbers: this.numbers(),
      firstPage: this.firstPage(),
    });
  });

  /** Arrow keys, Home and End move between the tabs, and select the one they reach. */
  protected onTabKey(event: KeyboardEvent): void {
    const index = TABS.findIndex((t) => t.key === this.tab());
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index + last) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.tab.set(TABS[next].key);
    this.host.nativeElement.querySelector<HTMLElement>(`#ink-ps-tab-${TABS[next].key}`)?.focus();
  }

  protected setLayout(layout: PageLayout): void {
    this.layout.set(layout);
    this.defaultSaved.set(false);
  }

  protected setColor(color: string | null): void {
    this.color.set(color);
    this.defaultSaved.set(false);
  }

  protected setPrintColor(print: boolean): void {
    this.printColor.set(print);
    this.defaultSaved.set(false);
  }

  protected setMarginText(band: Band, change: Partial<MarginText>): void {
    this.marginText.update((all) => ({ ...all, [band]: { ...all[band], ...change } }));
    this.defaultSaved.set(false);
  }

  protected setNumbers(change: Partial<PageNumbers>): void {
    this.numbers.update((numbers) => ({ ...numbers, ...change }));
    this.defaultSaved.set(false);
  }

  protected setFirstPage(show: boolean): void {
    this.firstPage.set(show);
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
