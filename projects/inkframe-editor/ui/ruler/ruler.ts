import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  EditorService,
  MAX_SIDE_MARGIN,
  MIN_TEXT_AREA_MM,
  PAGELESS_MIN_MARGIN_PX,
  PAGELESS_MIN_TEXT_PX,
  PX_PER_MM,
  PageSetup,
  findPaperSize,
  mmToUnits,
  pageDimensions,
} from '@inkframe-ui/editor/core';

type Side = 'left' | 'right';

/** Where the sheet is drawn, measured from the page (so it follows scrolling and the layout's limits). */
interface Geometry {
  /** The sheet's left edge and width, relative to the ruler. */
  sheetLeft: number;
  sheetWidth: number;
  /** The side margins as drawn, in pixels. */
  padLeft: number;
  padRight: number;
  /** How far the guide line reaches down the page while a handle is dragged. */
  canvasHeight: number;
  /** Screen pixels per CSS pixel of the sheet: its zoom. */
  scale: number;
}

const sameGeometry = (a: Geometry | null, b: Geometry | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.sheetLeft - b.sheetLeft) < 0.5 &&
    Math.abs(a.sheetWidth - b.sheetWidth) < 0.5 &&
    Math.abs(a.padLeft - b.padLeft) < 0.5 &&
    Math.abs(a.padRight - b.padRight) < 0.5 &&
    a.canvasHeight === b.canvasHeight &&
    Math.abs(a.scale - b.scale) < 0.001);

/** A margin handle: its position and its value as a slider. */
interface Handle {
  side: Side;
  label: string;
  /** Position relative to the ruler, in pixels. */
  x: number;
  /** The margin as stored: millimeters (Pages) or a share of the width (Pageless). */
  value: number;
  min: number;
  max: number;
  /** The slider's values in the units people read: cm, in or %. */
  now: number;
  ariaMin: number;
  ariaMax: number;
  text: string;
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left');

/**
 * The ruler above the page: the sheet, its shaded side margins, and a handle
 * on each margin. Dragging a handle previews the margin
 * (`EditorService.pageSetupPreview`) and releasing applies it, one undo step.
 * Each handle is a slider: arrow keys move it the way it looks, Up and Down
 * make the margin bigger or smaller, Shift (or Page Up and Page Down) takes
 * bigger steps. Pages are measured in the paper's units, counted from the
 * left margin; Pageless margins in percent of the width.
 *
 * Shown from 768px up. Place it above the canvas (`canvas`: the element with
 * the `ink-canvas` class), as `<ink-editor>` does.
 */
@Component({
  selector: 'ink-ruler',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-ruler" role="group" aria-label="Page margins">
      @if (geometry(); as g) {
        <div class="ink-ruler-sheet" [style.left.px]="g.sheetLeft" [style.width.px]="g.sheetWidth">
          <div class="ink-ruler-margin" [style.width.px]="g.padLeft"></div>
          <div class="ink-ruler-margin ink-ruler-margin-end" [style.width.px]="g.padRight"></div>
          <div class="ink-ruler-ticks" [style]="ticksStyle()"></div>
          @for (label of labels(); track label.x) {
            <span class="ink-ruler-label" [style.left.px]="label.x" aria-hidden="true">{{
              label.text
            }}</span>
          }
        </div>
        @for (handle of handles(); track handle.side) {
          <div
            class="ink-ruler-handle"
            [class.is-dragging]="dragging() === handle.side"
            role="slider"
            tabindex="0"
            aria-orientation="horizontal"
            [attr.aria-label]="handle.label"
            [attr.aria-valuenow]="handle.now"
            [attr.aria-valuemin]="handle.ariaMin"
            [attr.aria-valuemax]="handle.ariaMax"
            [attr.aria-valuetext]="handle.text"
            [style.left.px]="handle.x"
            (pointerdown)="startDrag(handle.side, $event)"
            (pointermove)="moveDrag($event)"
            (pointerup)="endDrag(true)"
            (pointercancel)="endDrag(false)"
            (lostpointercapture)="endDrag(false)"
            (keydown)="onKeydown(handle, $event)"
          ></div>
        }
      }
    </div>
    @if (dragged(); as handle) {
      <div
        class="ink-ruler-guide"
        [style.left.px]="handle.x"
        [style.height.px]="geometry()?.canvasHeight"
      ></div>
      <span class="ink-ruler-badge" [style.left.px]="handle.x" aria-hidden="true">{{
        handle.text
      }}</span>
    }
  `,
  styles: `
    :host {
      display: none;
      position: relative;
      z-index: 4;
      flex: 0 0 auto;
      --ink-ruler-tick: color-mix(in srgb, var(--ink-text-muted, #9a9891) 75%, transparent);
    }

    @media (min-width: 768px) {
      :host {
        display: block;
      }
    }

    .ink-ruler {
      position: relative;
      height: 24px;
      /* Clips sideways only, so handles can take touches a little below the ruler. */
      overflow-x: clip;
      overflow-y: visible;
      background: var(--ink-bg-app, #151515);
      border-bottom: 1px solid var(--ink-border-default, #2a2a29);
      user-select: none;
      -webkit-user-select: none;
    }

    .ink-ruler-sheet {
      position: absolute;
      top: 0;
      bottom: 0;
      overflow: hidden;
      background: var(--ink-bg-page, #1e1e1d);
    }

    .ink-ruler-margin {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      background: color-mix(in srgb, var(--ink-text-muted, #9a9891) 16%, transparent);
    }

    .ink-ruler-margin-end {
      left: auto;
      right: 0;
    }

    /* Ticks: whole units, halves and quarters (eighths of an inch), from the left margin. */
    .ink-ruler-ticks {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right, var(--ink-ruler-tick) 0 1px, transparent 1px),
        linear-gradient(to right, var(--ink-ruler-tick) 0 1px, transparent 1px),
        linear-gradient(to right, var(--ink-ruler-tick) 0 1px, transparent 1px);
      background-repeat: repeat-x;
      opacity: 0.8;
    }

    .ink-ruler-label {
      position: absolute;
      top: 3px;
      transform: translateX(-50%);
      font-size: 9px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--ink-text-muted, #9a9891);
      pointer-events: none;
    }

    /* A handle: a marker at the top and a thin line down the ruler. */
    .ink-ruler-handle {
      position: absolute;
      top: 0;
      width: 12px;
      height: 24px;
      margin-left: -6px;
      cursor: ew-resize;
      touch-action: none;
      outline: none;
      background: linear-gradient(var(--ink-active-text, #58aaa6), var(--ink-active-text, #58aaa6))
        center / 1px 100% no-repeat;
      opacity: 0.85;

      /* The marker. */
      &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0.5px;
        width: 11px;
        height: 10px;
        background: var(--ink-accent-primary, #028380);
        clip-path: polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%);
      }

      /* A bigger target than the marker. */
      &::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -4px;
        right: -4px;
      }

      &:hover,
      &.is-dragging {
        opacity: 1;
      }

      &:focus-visible {
        opacity: 1;
        box-shadow: 0 0 0 2px var(--ink-border-focus, rgba(88, 170, 166, 0.6));
        border-radius: 3px;
      }
    }

    /* While dragging: a line down the page and the margin's size. */
    .ink-ruler-guide {
      position: absolute;
      top: 24px;
      width: 0;
      border-left: 1px dashed var(--ink-active-text, #58aaa6);
      pointer-events: none;
    }

    .ink-ruler-badge {
      position: absolute;
      top: 30px;
      transform: translateX(-50%);
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--ink-bg-popover, #242423);
      box-shadow: var(--ink-shadow-popover, 0 6px 20px rgba(0, 0, 0, 0.4));
      color: var(--ink-text-primary, #f0efec);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
    }

    @media (pointer: coarse) {
      .ink-ruler-handle::before {
        left: -16px;
        right: -16px;
        bottom: -20px;
      }
    }
  `,
})
export class Ruler {
  private readonly svc = inject(EditorService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The scrolling canvas the ruler measures (the element with the `ink-canvas` class). */
  readonly canvas = input.required<HTMLElement>();

  protected readonly geometry = signal<Geometry | null>(null, { equal: sameGeometry });
  protected readonly dragging = signal<Side | null>(null);
  private dragPointer: number | null = null;

  /** The page setup on screen: the one being dragged, otherwise the document's. */
  private readonly shown = computed(() => this.svc.pageSetupPreview() ?? this.svc.pageSetup());
  private readonly units = computed(() => {
    const setup = this.shown();
    return setup.layout === 'pages' ? findPaperSize(setup.paper).units : null;
  });

  protected readonly handles = computed<Handle[]>(() => {
    const g = this.geometry();
    if (!g) return [];
    return (['left', 'right'] as const).map((side) => this.handleFor(side, this.shown(), g));
  });

  protected readonly dragged = computed(() => {
    const side = this.dragging();
    return this.handles().find((h) => h.side === side) ?? null;
  });

  /** One whole unit (cm or in) in pixels; Pageless draws centimeters, without numbers. */
  private readonly unitPx = computed(
    () => (this.units() === 'in' ? 96 : PX_PER_MM * 10) * (this.geometry()?.scale ?? 1),
  );

  protected readonly ticksStyle = computed(() => {
    const g = this.geometry();
    if (!g) return {};
    const unit = this.unitPx();
    const minor = this.units() === 'in' ? unit / 8 : unit / 4;
    const at = `${g.padLeft}px 100%`;
    return {
      'background-size': `${unit}px 7px, ${unit / 2}px 5px, ${minor}px 3px`,
      'background-position': `${at}, ${at}, ${at}`,
    };
  });

  /** Unit numbers counted from the left margin, both ways (Pages only). */
  protected readonly labels = computed(() => {
    const g = this.geometry();
    if (!g || !this.units()) return [];
    const unit = this.unitPx();
    const labels: { x: number; text: string }[] = [];
    const first = -Math.floor(g.padLeft / unit);
    const last = Math.floor((g.sheetWidth - g.padLeft) / unit);
    for (let k = first; k <= last; k++) {
      const x = g.padLeft + k * unit;
      if (k !== 0 && x > 6 && x < g.sheetWidth - 6) labels.push({ x, text: String(Math.abs(k)) });
    }
    return labels;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    // A new zoom moves and resizes the sheet on screen without changing its CSS size.
    afterRenderEffect(() => {
      this.svc.effectiveZoom();
      this.measure();
    });
    // The sheet moves when the window resizes or the canvas scrolls sideways,
    // and its margins change with the page setup (the body's size changes).
    afterNextRender(() => {
      const canvas = this.canvas();
      const measure = () => this.measure();
      // Missing in some test environments (jsdom); every browser has it.
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
      for (const el of [canvas, ...canvas.querySelectorAll('.ink-sheet, .ink-sheet-body')]) {
        observer?.observe(el);
      }
      canvas.addEventListener('scroll', measure, { passive: true });
      measure();
      destroyRef.onDestroy(() => {
        observer?.disconnect();
        canvas.removeEventListener('scroll', measure);
        this.svc.pageSetupPreview.set(null);
      });
    });
  }

  private measure(): void {
    const canvas = this.canvas();
    const sheet = canvas.querySelector('.ink-sheet');
    const body = canvas.querySelector('.ink-sheet-body');
    if (!sheet || !body) return;
    const ruler = this.host.nativeElement.getBoundingClientRect();
    const rect = sheet.getBoundingClientRect();
    const style = getComputedStyle(body);
    // Computed sizes are CSS pixels; on a zoomed sheet the screen shows them bigger or smaller.
    const scale = rect.width / (sheet as HTMLElement).offsetWidth || 1;
    this.geometry.set({
      sheetLeft: rect.left - ruler.left,
      sheetWidth: rect.width,
      padLeft: (parseFloat(style.paddingLeft) || 0) * scale,
      padRight: (parseFloat(style.paddingRight) || 0) * scale,
      canvasHeight: canvas.clientHeight,
      scale,
    });
  }

  private handleFor(side: Side, setup: PageSetup, g: Geometry): Handle {
    const label = side === 'left' ? 'Left margin' : 'Right margin';
    const x = side === 'left' ? g.sheetLeft + g.padLeft : g.sheetLeft + g.sheetWidth - g.padRight;
    if (setup.layout === 'pages') {
      const units = findPaperSize(setup.paper).units;
      const value = setup.margins[side];
      const max = Math.max(
        0,
        pageDimensions(setup).width - setup.margins[other(side)] - MIN_TEXT_AREA_MM,
      );
      const now = mmToUnits(value, units);
      return {
        side,
        label,
        x,
        value,
        min: 0,
        max,
        now,
        ariaMin: 0,
        ariaMax: mmToUnits(max, units),
        text: `${now} ${units}`,
      };
    }
    const value = setup.sideMargins[side];
    const width = Math.max(g.sheetWidth, 1);
    const min = Math.min(PAGELESS_MIN_MARGIN_PX / width, MAX_SIDE_MARGIN);
    const room = (width - PAGELESS_MIN_TEXT_PX) / width - setup.sideMargins[other(side)];
    const max = Math.max(min, Math.min(MAX_SIDE_MARGIN, room));
    const now = Math.round(value * 100);
    return {
      side,
      label,
      x,
      value,
      min,
      max,
      now,
      ariaMin: Math.round(min * 100),
      ariaMax: Math.round(max * 100),
      text: `${now}%`,
    };
  }

  /** The step for one key press (or the drag's snap), and for a big step. */
  private steps(setup: PageSetup): { small: number; big: number } {
    if (setup.layout !== 'pages') return { small: 0.01, big: 0.05 };
    return findPaperSize(setup.paper).units === 'in'
      ? { small: 25.4 / 16, big: 25.4 / 4 }
      : { small: 1, big: 10 };
  }

  private withMargin(setup: PageSetup, side: Side, value: number): PageSetup {
    return setup.layout === 'pages'
      ? { ...setup, margins: { ...setup.margins, [side]: round(value, 2) } }
      : { ...setup, sideMargins: { ...setup.sideMargins, [side]: round(value, 3) } };
  }

  // ── Dragging ───────────────────────────────────────────────────
  protected startDrag(side: Side, event: PointerEvent): void {
    if (event.button !== 0 || this.dragging()) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    this.dragPointer = event.pointerId;
    this.dragging.set(side);
  }

  protected moveDrag(event: PointerEvent): void {
    const side = this.dragging();
    const g = this.geometry();
    if (!side || !g || event.pointerId !== this.dragPointer) return;
    const setup = this.svc.pageSetup();
    const handle = this.handleFor(side, this.shown(), g);
    const x = event.clientX - this.host.nativeElement.getBoundingClientRect().left;
    const fromEdge = side === 'left' ? x - g.sheetLeft : g.sheetLeft + g.sheetWidth - x;
    const step = this.steps(setup).small;
    const raw =
      setup.layout === 'pages' ? fromEdge / (PX_PER_MM * g.scale) : fromEdge / g.sheetWidth;
    const value = clamp(Math.round(raw / step) * step, handle.min, handle.max);
    this.svc.pageSetupPreview.set(this.withMargin(this.shown(), side, value));
  }

  /** Releasing applies the previewed margin; a cancelled drag (or Escape) drops it. */
  protected endDrag(apply: boolean): void {
    if (!this.dragging()) return;
    const preview = this.svc.pageSetupPreview();
    this.dragging.set(null);
    this.dragPointer = null;
    if (apply && preview) this.svc.setPageSetup(preview);
    this.svc.pageSetupPreview.set(null);
  }

  // ── Keyboard ───────────────────────────────────────────────────
  protected onKeydown(handle: Handle, event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.dragging()) {
      event.preventDefault();
      this.endDrag(false);
      return;
    }
    const setup = this.svc.pageSetup();
    const { small, big } = this.steps(setup);
    const step = event.shiftKey ? big : small;
    // Left and Right move the handle the way it looks; Up and Down change the margin's size.
    const outward = handle.side === 'left' ? -1 : 1;
    let value: number;
    switch (event.key) {
      case 'ArrowLeft':
        value = handle.value + step * outward;
        break;
      case 'ArrowRight':
        value = handle.value - step * outward;
        break;
      case 'ArrowUp':
        value = handle.value + step;
        break;
      case 'ArrowDown':
        value = handle.value - step;
        break;
      case 'PageUp':
        value = handle.value + big;
        break;
      case 'PageDown':
        value = handle.value - big;
        break;
      case 'Home':
        value = handle.min;
        break;
      case 'End':
        value = handle.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.svc.setPageSetup(
      this.withMargin(setup, handle.side, clamp(value, handle.min, handle.max)),
    );
  }
}
