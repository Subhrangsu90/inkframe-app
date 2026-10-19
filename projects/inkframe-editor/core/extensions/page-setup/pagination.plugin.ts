import { Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { TableMap } from 'prosemirror-tables';
import { EditorHooks } from '../../editor/editor-hooks';
import { pageSetupOf } from './page-setup';
import { BreakBefore, PageSlice, editScope, lineBreakBefore, planPages } from './pagination';
import {
  Line,
  PAGE_VIEW_MEDIA,
  blockSpacerHeight,
  createPageSpacer,
  lineStartIn,
  linesOf,
  measurePages,
} from './pagination-dom';

/**
 * Page view: shows a Pages document as separate pages. Measures the document
 * as laid out on one long sheet, decides where pages start (planPages, with
 * the print rules) and moves what follows each page end to the next page with
 * spacers: widget decorations, so the document itself never changes.
 *
 * Works inside `<ink-editor>`'s canvas (`.ink-canvas` > `.ink-sheet` >
 * `.ink-sheet-body`), in Pages layout from 768px up; phones reflow. Reports
 * the number of pages (0 when off) through `EditorHooks.onPageCount`.
 */
export const paginationKey = new PluginKey<DecorationSet>('ink-pagination');

/** How long to wait after an edit before laying out the pages again. */
const AFTER_EDIT_MS = 120;

/** Where the space before a page goes. */
type Anchor =
  | { kind: 'inline'; pos: number } // in a paragraph, before a line
  | { kind: 'block'; pos: number; dom: HTMLElement } // before a block
  | { kind: 'row'; pos: number; columns: number }; // before a table row

interface MeasuredSlice extends PageSlice {
  anchor(): Anchor | null;
}

/**
 * Blocks that stay whole on a page when they fit (as `break-inside: avoid` in
 * print). List items too: printed with page view's breaks, a list item split
 * in two would show a second bullet or number on the next page. A page
 * before a list item starts before the whole item, so its bullet, number or
 * checkbox moves with it.
 */
const KEEP_WHOLE = new Set(['blockquote', 'callout', 'task_item', 'list_item']);

/** Measures the document into slices, in sheet CSS pixels, top to bottom. */
class SliceCollector {
  readonly slices: MeasuredSlice[] = [];
  private pending: BreakBefore = 'allowed';

  constructor(
    private readonly view: EditorView,
    private readonly sheetTop: number,
    private readonly scale: number,
    /** The height of a page's text area: blocks up to this tall stay whole. */
    private readonly room: number,
  ) {}

  private y(clientY: number): number {
    return (clientY - this.sheetTop) / this.scale;
  }

  private add(top: number, bottom: number, before: BreakBefore, anchor: () => Anchor | null) {
    const pending = this.pending;
    this.pending = 'allowed';
    const merged: BreakBefore =
      pending === 'forced' || before === 'forced'
        ? 'forced'
        : pending === 'avoid' || before === 'avoid'
          ? 'avoid'
          : 'allowed';
    this.slices.push({ top, bottom, before: merged, anchor });
  }

  /** The children of `parent`, whose content starts at `start`. */
  blocks(parent: PMNode, start: number): void {
    parent.forEach((child, offset) => this.block(child, start + offset));
  }

  private block(node: PMNode, pos: number): void {
    const dom = this.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    if (!rect.height) return;
    const top = this.y(rect.top);
    const bottom = this.y(rect.bottom);
    const name = node.type.name;
    const whole = (): Anchor => ({ kind: 'block', pos, dom });

    if (name === 'page_break') {
      this.add(top, bottom, 'allowed', whole);
      this.pending = 'forced';
      return;
    }
    if (name === 'table') return this.table(node, pos, top, whole);
    if (node.isTextblock) {
      const code = !!node.type.spec.code;
      if (code && bottom - top <= this.room) return this.add(top, bottom, 'allowed', whole);
      this.lines(node, pos, dom, code ? { top, bottom, whole } : null);
      if (name === 'heading') this.pending = 'avoid'; // a heading stays with what follows
      return;
    }
    if (KEEP_WHOLE.has(name) && bottom - top <= this.room) {
      return this.add(top, bottom, 'allowed', whole);
    }
    if (node.isLeaf || !node.childCount) return this.add(top, bottom, 'allowed', whole);
    this.blocks(node, pos + 1);
  }

  /** A paragraph's lines (a code block's when taller than a page). */
  private lines(
    node: PMNode,
    pos: number,
    dom: HTMLElement,
    box: { top: number; bottom: number; whole: () => Anchor } | null,
  ): void {
    const found = this.view.domAtPos(pos + 1).node;
    const content = found instanceof HTMLElement && dom.contains(found) ? found : dom;
    const lines = linesOf(content, this.scale);
    if (!lines.length) {
      const r = dom.getBoundingClientRect();
      this.add(this.y(r.top), this.y(r.bottom), 'allowed', () => ({
        kind: 'inline',
        pos: pos + 1,
      }));
      return;
    }
    lines.forEach((line, i) => {
      const top = box && i === 0 ? box.top : this.y(line.top);
      const bottom = box && i === lines.length - 1 ? box.bottom : this.y(line.bottom);
      const anchor =
        i > 0
          ? () => this.lineStart(node, pos, content, line)
          : box
            ? box.whole
            : (): Anchor => ({ kind: 'inline', pos: pos + 1 });
      this.add(top, bottom, lineBreakBefore(i, lines.length), anchor);
    });
  }

  /** The position of a line's first character, from its place on screen. */
  private lineStart(node: PMNode, pos: number, content: Element, line: Line): Anchor | null {
    let hit: number | null = null;
    const at = lineStartIn(content, line);
    try {
      if (at) hit = this.view.posAtDOM(at.text, at.offset);
    } catch {
      // Text ProseMirror doesn't map (a widget's, for one): find it by coordinates below.
    }
    hit ??=
      this.view.posAtCoords({ left: line.left + 1, top: (line.top + line.bottom) / 2 })?.pos ??
      null;
    if (hit === null) return null;
    return { kind: 'inline', pos: Math.min(Math.max(hit, pos + 1), pos + node.nodeSize - 1) };
  }

  /**
   * Table rows; a page may start between any two. The first row carries the
   * table's top (its column handles), and a page before it moves the table.
   */
  private table(node: PMNode, pos: number, top: number, whole: () => Anchor): void {
    const columns = TableMap.get(node).width;
    let first = true;
    node.forEach((row, offset) => {
      const rowPos = pos + 1 + offset;
      const rowDom = this.view.nodeDOM(rowPos);
      if (!(rowDom instanceof HTMLElement)) return;
      const r = rowDom.getBoundingClientRect();
      const rowTop = first ? top : this.y(r.top);
      const anchor = first ? whole : (): Anchor => ({ kind: 'row', pos: rowPos, columns });
      this.add(rowTop, this.y(r.bottom), 'allowed', anchor);
      first = false;
    });
  }
}

interface Spacer {
  anchor: Anchor;
  height: number;
}

/** The height of every textblock, in CSS pixels, keyed by its DOM element. */
function textblockHeights(view: EditorView, scale: number): WeakMap<Element, number> {
  const heights = new WeakMap<Element, number>();
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) heights.set(dom, dom.getBoundingClientRect().height / scale);
    return false;
  });
  return heights;
}

const spacerHeight = (anchor: Anchor, space: number): number =>
  anchor.kind === 'block' ? blockSpacerHeight(anchor.dom, space) : space;

const spacerDOM = ({ anchor, height }: Spacer): HTMLElement =>
  createPageSpacer(anchor.kind, height, anchor.kind === 'row' ? anchor.columns : 1);

const keyOf = (kind: string, pos: number, height: number) => `${kind}:${pos}:${height.toFixed(1)}`;

class PaginationView {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private pages = -1;
  private width = 0;
  /** The document when the pages were last laid out, or last found unchanged. */
  private laidOut: PMNode | null = null;
  /** Whether the next layout must measure everything: after anything but an edit. */
  private full = true;
  /** Each textblock's height at the last full layout, in CSS pixels. */
  private heights = new WeakMap<Element, number>();
  private readonly wide = typeof matchMedia === 'function' ? matchMedia(PAGE_VIEW_MEDIA) : null;
  private readonly observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          // Only a new width moves lines; a taller document is an edit (see update).
          const width = this.view.dom.offsetWidth;
          if (width !== this.width) {
            this.width = width;
            this.onChange();
          }
        })
      : null;
  private readonly onChange = () => {
    this.full = true;
    this.schedule(0);
  };

  constructor(
    private readonly view: EditorView,
    private readonly hooks: EditorHooks,
  ) {
    this.observer?.observe(view.dom);
    this.wide?.addEventListener('change', this.onChange);
    // Images change the layout when they load, and so do fonts.
    view.dom.addEventListener('load', this.onChange, true);
    void document.fonts?.ready.then(this.onChange);
    this.schedule(0);
  }

  update(view: EditorView, prev: { doc: PMNode }): void {
    if (view.state.doc !== prev.doc) this.schedule(AFTER_EDIT_MS);
  }

  destroy(): void {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.wide?.removeEventListener('change', this.onChange);
    this.view.dom.removeEventListener('load', this.onChange, true);
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.timer = setTimeout(() => {
      this.frame = requestAnimationFrame(() => this.layOut());
    }, delay);
  }

  private layOut(): void {
    const view = this.view;
    if (view.isDestroyed) return;
    if (view.composing) return this.schedule(300); // not while text is being composed (IME)
    const sheet = view.dom.closest<HTMLElement>('.ink-sheet');
    const body = view.dom.closest<HTMLElement>('.ink-sheet-body');
    const doc = view.state.doc;
    const setup = pageSetupOf(doc);
    if (!sheet || !body || !this.wide?.matches || setup.layout !== 'pages') {
      this.laidOut = null;
      return this.show([], 0);
    }
    // Most pauses in typing leave every page as it is: skip measuring then.
    if (!this.full && this.laidOut && this.keepsPages(this.laidOut, doc, sheet)) {
      this.laidOut = doc;
      return;
    }

    // Measure the document as one long sheet: the spacers out of the way.
    body.classList.add('ink-paginating');
    let spacers: Spacer[];
    let pages: number;
    try {
      const page = measurePages(sheet, body, setup);
      const collector = new SliceCollector(view, page.top, page.scale, page.room);
      collector.blocks(doc, 0);
      const plan = planPages(collector.slices, page.frame);
      spacers = [];
      for (const { slice, space } of plan.breaks) {
        const anchor = collector.slices[slice].anchor();
        if (anchor) spacers.push({ anchor, height: spacerHeight(anchor, space) });
      }
      pages = plan.pages;
      this.heights = textblockHeights(view, page.scale);
    } finally {
      body.classList.remove('ink-paginating');
    }
    this.full = false;
    this.laidOut = doc;
    this.show(spacers, pages);
  }

  /**
   * Whether the edits since the last layout leave every page as it is: all
   * inside one textblock that holds no page start and kept its height.
   */
  private keepsPages(before: PMNode, doc: PMNode, sheet: HTMLElement): boolean {
    const scope = editScope(before, doc);
    if (scope === 'none') return true;
    if (scope === 'other') return false;
    const pos = scope.textblock;
    const end = pos + doc.nodeAt(pos)!.nodeSize - 1;
    if (paginationKey.getState(this.view.state)?.find(pos + 1, end).length) return false;
    const dom = this.view.nodeDOM(pos);
    const height = dom instanceof HTMLElement ? this.heights.get(dom) : undefined;
    if (!(dom instanceof HTMLElement) || height === undefined) return false;
    const scale = sheet.getBoundingClientRect().width / sheet.offsetWidth || 1;
    return Math.abs(dom.getBoundingClientRect().height / scale - height) < 0.5;
  }

  private show(spacers: Spacer[], pages: number): void {
    // Compared with the spacers shown, as moved by the edits since.
    const shown = paginationKey.getState(this.view.state)?.find() ?? [];
    const signature = spacers.map((s) => keyOf(s.anchor.kind, s.anchor.pos, s.height)).join(' ');
    const current = shown.map((d) => keyOf(d.spec['kind'], d.from, d.spec['height'])).join(' ');
    if (signature !== current) {
      const decorations = spacers.map((s) =>
        Decoration.widget(s.anchor.pos, () => spacerDOM(s), {
          side: -1,
          key: keyOf(s.anchor.kind, s.anchor.pos, s.height),
          ignoreSelection: true,
          kind: s.anchor.kind,
          height: s.height,
        }),
      );
      const set = DecorationSet.create(this.view.state.doc, decorations);
      this.view.dispatch(
        this.view.state.tr.setMeta(paginationKey, set).setMeta('addToHistory', false),
      );
    }
    if (pages !== this.pages) {
      this.pages = pages;
      this.hooks.onPageCount?.(pages);
    }
  }
}

/**
 * Where page view starts each page after the first: document positions,
 * following edits made since the pages were last laid out. Empty when page
 * view is off. For printing the same pages, see `withPageStarts`.
 */
export function pageStartsOf(state: EditorState): number[] {
  const set = paginationKey.getState(state);
  return set ? set.find().map((d) => d.from) : [];
}

export function paginationPlugin(hooks: EditorHooks): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: paginationKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => tr.getMeta(paginationKey) ?? set.map(tr.mapping, tr.doc),
    },
    props: {
      decorations: (state) => paginationKey.getState(state),
    },
    view: (view) => new PaginationView(view, hooks),
  });
}
