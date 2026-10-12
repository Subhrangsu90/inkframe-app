import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Command, EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MarkType, NodeType, Schema } from 'prosemirror-model';
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import {
  redo,
  redoDepth,
  undo,
  undoDepth,
} from 'prosemirror-history';

import { CalloutKind } from './schema';
import { SCHEMA_VERSION, StoredDoc, migrate } from './migrations';
import { clearFormattingCommand, toggleListCommand } from './plugins';
import {
  EditorHooks,
  FloatingMenuState,
  SlashMenuState,
  TableMenuState,
} from './editor-hooks';
import { slashKey } from './menus.plugin';
import { sanitizeHref } from './link-utils';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  setCellAttr,
  toggleHeaderRow,
} from 'prosemirror-tables';
import { SlashItem } from './slash-items';
import { EditorExtension } from './extension-types';
import { ExtensionManager } from './extension-manager';
import { DEFAULT_EXTENSIONS } from './default-extensions';
import { imageStorage } from './image-storage';

export interface BlockInfo {
  type: string; // 'paragraph' | 'heading' | 'code_block' | ...
  level: number | null; // heading level
  list: 'bullet_list' | 'ordered_list' | 'task_list' | null; // innermost enclosing list
}

export interface MountOptions {
  doc?: StoredDoc | null;
  editable?: boolean;
  onChange?: () => void;
  extensions?: EditorExtension[];
}

const sameBlock = (a: BlockInfo, b: BlockInfo) =>
  a.type === b.type && a.level === b.level && a.list === b.list;

export interface ImagePreviewData {
  src: string;
  alt?: string;
  title?: string;
}

@Injectable()
export class EditorService implements EditorHooks {
  private readonly env = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);

  view?: EditorView;
  private onChange?: () => void;
  private editableFlag = true;

  // ── Modular Extension System ─────────────────────────────────────
  readonly extensions = signal<EditorExtension[]>(DEFAULT_EXTENSIONS);
  readonly extensionManager = computed(
    () => new ExtensionManager(this.extensions(), this, this),
  );

  get envInjector(): EnvironmentInjector {
    return this.env;
  }

  get appReference(): ApplicationRef {
    return this.appRef;
  }

  /**
   * The schema the editor is running on. Commands must use these node and
   * mark types: ProseMirror compares types by identity, so types from any
   * other Schema instance (even one built from the same specs) are ignored
   * or silently dropped.
   */
  get schema(): Schema {
    return this.view?.state.schema ?? this.extensionManager().schema;
  }

  /**
   * Swaps the active extensions. When the editor is already mounted, the view
   * is reconfigured with the new schema, plugins and node views. If the
   * current document cannot be represented by the new extensions (e.g. it
   * contains a table and the table extension was removed), the previous
   * extensions are kept so no content is lost.
   */
  setExtensions(extensions: EditorExtension[]): void {
    const previous = this.extensions();
    if (previous === extensions) return;
    this.extensions.set(extensions);

    const v = this.view;
    if (!v) return;
    try {
      const state = this.createState(this.getJSON());
      state.doc.check();
      v.setProps({ state, nodeViews: this.extensionManager().buildNodeViews() });
      this.syncSignals(state);
    } catch (e) {
      console.error(
        '[inkframe] The current document uses content that the new extensions do not support; keeping the previous extensions.',
        e,
      );
      this.extensions.set(previous);
    }
  }

  hasExtension(name: string): boolean {
    return this.extensionManager().has(name);
  }

  readonly customToolbarItems = computed(() =>
    this.extensionManager().getToolbarItems().filter(
      (item) => !item.group || item.group === 'custom' || item.group === 'action',
    ),
  );

  readonly customFloatingItems = computed(() =>
    this.extensionManager().getFloatingItems(),
  );

  // ── UI-facing state ──────────────────────────────────────────────
  readonly isBold = signal(false);
  readonly isItalic = signal(false);
  readonly isCode = signal(false);
  readonly isLink = signal(false);
  readonly isUnderline = signal(false);
  readonly isStrike = signal(false);
  readonly isSubscript = signal(false);
  readonly isSuperscript = signal(false);
  readonly isSmall = signal(false);
  readonly currentColor = signal<string | null>(null);
  readonly block = signal<BlockInfo>(
    { type: 'paragraph', level: null, list: null },
    { equal: sameBlock },
  );
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly isInTable = signal(false);

  readonly imagePreview = signal<ImagePreviewData | null>(null);
  readonly openHistoryRequested = signal<number>(0);
  private currentDocSnapshot: StoredDoc | null = null;

  requestOpenHistory(): void {
    this.openHistoryRequested.update((n) => n + 1);
  }

  /**
   * Incremented when the user asks to add or edit a link (`Mod-k`). The
   * floating menu opens its link popover when it is showing, otherwise the
   * toolbar opens its own.
   */
  readonly linkEditorRequests = signal(0);

  requestLinkEditor(): void {
    this.linkEditorRequests.update((n) => n + 1);
  }

  readonly tableMenu = signal<TableMenuState | null>(null, {
    equal: (a, b) =>
      a === b ||
      (!!a && !!b && a.left === b.left && a.top === b.top),
  });

  readonly floatingMenu = signal<FloatingMenuState | null>(null, {
    equal: (a, b) =>
      a === b ||
      (!!a && !!b && a.left === b.left && a.top === b.top),
  });
  readonly slashMenu = signal<SlashMenuState | null>(null, {
    equal: (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.query === b.query &&
        a.from === b.from &&
        a.to === b.to &&
        a.left === b.left &&
        a.top === b.top),
  });
  readonly slashActive = signal(0);
  readonly slashItems = computed(() => {
    const q = this.slashMenu()?.query.toLowerCase() ?? '';
    const items = this.extensionManager().getSlashItems();
    return items.filter(
      (i) =>
        !q ||
        i.label.toLowerCase().includes(q) ||
        i.keywords.some((k) => k.startsWith(q)),
    );
  });

  openImagePreview(data: ImagePreviewData): void {
    this.imagePreview.set(data);
  }

  closeImagePreview(): void {
    this.imagePreview.set(null);
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  mount(el: HTMLElement, opts: MountOptions = {}): void {
    if (opts.extensions) {
      this.extensions.set(opts.extensions);
    }
    if (opts.doc) {
      this.currentDocSnapshot = opts.doc;
    }
    this.onChange = opts.onChange;
    this.editableFlag = opts.editable ?? true;
    const self = this;

    // Created outside Angular's zone by virtue of being called from afterNextRender
    // and only touching signals from callbacks (see section 2.1, rule 2).
    this.view = new EditorView(el, {
      // A document passed to setDoc() before mounting wins over a missing initial doc.
      state: this.createState(opts.doc ?? this.currentDocSnapshot),
      editable: () => this.editableFlag,
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document editor',
      },
      nodeViews: this.extensionManager().buildNodeViews(),
      handlePaste: (_view, event) =>
        this.handleImageFiles(event, event.clipboardData?.files),
      handleDrop: (_view, event) =>
        this.handleImageFiles(event, event.dataTransfer?.files),
      dispatchTransaction(this: EditorView, tr) {
        const next = this.state.apply(tr);
        this.updateState(next);
        self.afterUpdate(next, tr.docChanged);
      },
    });
    this.view.dom.classList.toggle('ProseMirror-preview', !this.editableFlag);
    this.syncSignals(this.view.state);
  }

  destroy(): void {
    this.view?.destroy();
    this.view = undefined;
  }

  focus(): void {
    if (!this.editableFlag) return;
    this.view?.focus();
  }

  getJSON(): StoredDoc {
    if (!this.view) {
      return (
        this.currentDocSnapshot || {
          schemaVersion: SCHEMA_VERSION,
          doc: { type: 'doc', content: [] },
        }
      );
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      doc: this.view.state.doc.toJSON(),
    };
  }

  /**
   * Replace the whole document (loads fresh state, resets undo history).
   * Throws if the document cannot be parsed with the active schema; the
   * current document is left untouched in that case.
   */
  setDoc(stored: StoredDoc): void {
    const v = this.view;
    if (!v) {
      this.currentDocSnapshot = stored;
      return;
    }
    const state = this.createState(stored, v.state.plugins);
    this.currentDocSnapshot = stored;
    v.updateState(state);
    this.syncSignals(state);
  }

  setEditable(editable: boolean): void {
    this.editableFlag = editable;
    if (this.view) {
      this.view.setProps({ editable: () => this.editableFlag });
      this.view.dom.classList.toggle('ProseMirror-preview', !editable);
      if (!editable) {
        this.view.dom.blur();
        this.floatingMenu.set(null);
        this.slashMenu.set(null);
        this.tableMenu.set(null);
      }
    }
  }

  private createState(
    stored?: StoredDoc | null,
    plugins?: readonly Plugin[],
  ) {
    const mgr = this.extensionManager();
    const currentSchema = mgr.schema;
    const activePlugins = plugins ?? mgr.buildPlugins();
    const doc = stored ? currentSchema.nodeFromJSON(migrate(stored)) : undefined;
    return EditorState.create({ schema: currentSchema, doc, plugins: activePlugins });
  }

  private handleImageFiles(event: Event, files?: FileList | null): boolean {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/') || !this.schema.nodes['image']) {
      return false;
    }
    event.preventDefault();
    this.insertImage(file);
    return true;
  }

  private afterUpdate(state: EditorState, docChanged: boolean): void {
    this.syncSignals(state);
    if (docChanged) this.onChange?.();
  }

  private syncSignals(state: EditorState): void {
    const { from, to, empty, $from } = state.selection;
    const active = (type?: MarkType) =>
      !type
        ? false
        : empty
        ? !!type.isInSet(state.storedMarks ?? $from.marks())
        : state.doc.rangeHasMark(from, to, type);

    this.isBold.set(active(state.schema.marks['strong']));
    this.isItalic.set(active(state.schema.marks['em']));
    this.isCode.set(active(state.schema.marks['code']));
    this.isLink.set(active(state.schema.marks['link']));
    this.isUnderline.set(active(state.schema.marks['underline']));
    this.isStrike.set(active(state.schema.marks['strikethrough']));
    this.isSubscript.set(active(state.schema.marks['subscript']));
    this.isSuperscript.set(active(state.schema.marks['superscript']));
    this.isSmall.set(active(state.schema.marks['small']));

    const textColorMark = state.schema.marks['textColor'];
    let color: string | null = null;
    if (textColorMark) {
      if (empty) {
        const mark = textColorMark.isInSet(state.storedMarks ?? $from.marks());
        if (mark) color = (mark.attrs['color'] as string) ?? null;
      } else {
        state.doc.nodesBetween(from, to, (node) => {
          const mark = node.marks.find((m) => m.type === textColorMark);
          if (mark) color = (mark.attrs['color'] as string) ?? null;
        });
      }
    }
    this.currentColor.set(color);

    let list: BlockInfo['list'] = null;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === 'bullet_list' || name === 'ordered_list' || name === 'task_list') {
        list = name as any;
        break;
      }
    }
    const parent = $from.parent;
    this.block.set({
      type: parent.type.name,
      level:
        parent.type.name === 'heading'
          ? (parent.attrs['level'] as number)
          : null,
      list,
    });

    this.canUndo.set(undoDepth(state) > 0);
    this.canRedo.set(redoDepth(state) > 0);
    this.isInTable.set(isInTable(state));
  }

  // ── EditorHooks (called by the menus plugin) ─────────────────────
  onFloatingMenu(state: FloatingMenuState | null): void {
    this.floatingMenu.set(state);
  }

  onSlashMenu(state: SlashMenuState | null): void {
    if (state?.query !== this.slashMenu()?.query) this.slashActive.set(0);
    this.slashMenu.set(state);
  }

  onTableMenu(state: TableMenuState | null): void {
    this.tableMenu.set(state);
  }

  onSlashKeyDown(e: KeyboardEvent): boolean {
    if (!this.slashMenu()) return false;
    const items = this.slashItems();
    const n = items.length;
    switch (e.key) {
      case 'ArrowDown':
        if (!n) return false;
        this.slashActive.update((i) => (i + 1) % n);
        return true;
      case 'ArrowUp':
        if (!n) return false;
        this.slashActive.update((i) => (i - 1 + n) % n);
        return true;
      case 'Enter':
      case 'Tab': {
        const item = items[this.slashActive()];
        if (!item) return false;
        this.runSlashItem(item);
        return true;
      }
      case 'Escape':
        this.view?.dispatch(
          this.view.state.tr.setMeta(slashKey, { dismiss: true }),
        );
        return true;
      default:
        return false;
    }
  }

  runSlashItem(item: SlashItem): void {
    const menu = this.slashMenu();
    const v = this.view;
    if (!menu || !v) return;
    v.dispatch(v.state.tr.delete(menu.from, menu.to)); // remove "/query"
    item.run(this);
    v.focus();
  }

  // ── Commands (called by toolbar and menus) ───────────────────────
  private markType(name: string): MarkType | undefined {
    return this.schema.marks[name];
  }

  private nodeType(name: string): NodeType | undefined {
    return this.schema.nodes[name];
  }

  /** Toggles a formatting mark; marks cannot be combined with inline code. */
  private toggleFormatMark(name: string): void {
    const type = this.markType(name);
    if (!type || this.isCode()) return;
    this.run(toggleMark(type));
  }

  toggleBold() {
    this.toggleFormatMark('strong');
  }
  toggleItalic() {
    this.toggleFormatMark('em');
  }
  toggleCode() {
    const codeType = this.markType('code');
    if (!codeType) return;
    this.run((state, dispatch) => {
      const { from, to, empty, $from } = state.selection;
      const hasCode = empty
        ? !!codeType.isInSet(state.storedMarks ?? $from.marks())
        : state.doc.rangeHasMark(from, to, codeType);

      let tr = state.tr;
      if (hasCode) {
        if (empty) {
          tr = tr.removeStoredMark(codeType);
        } else {
          tr = tr.removeMark(from, to, codeType);
        }
      } else {
        if (empty) {
          tr = tr.setStoredMarks([codeType.create()]);
        } else {
          Object.values(state.schema.marks).forEach((m) => {
            if (m !== codeType) {
              tr = tr.removeMark(from, to, m);
            }
          });
          tr = tr.addMark(from, to, codeType.create());
        }
      }
      dispatch?.(tr);
      return true;
    });
  }
  toggleUnderline() {
    this.toggleFormatMark('underline');
  }
  toggleStrike() {
    this.toggleFormatMark('strikethrough');
  }
  toggleSubscript() {
    this.toggleFormatMark('subscript');
  }
  toggleSuperscript() {
    this.toggleFormatMark('superscript');
  }
  toggleSmall() {
    this.toggleFormatMark('small');
  }
  setTextColor(color: string) {
    const markType = this.markType('textColor');
    if (!markType || this.isCode()) return;
    this.run((state, dispatch) => {
      const { from, to, empty } = state.selection;
      if (empty) {
        dispatch?.(state.tr.addStoredMark(markType.create({ color })));
      } else {
        dispatch?.(
          state.tr
            .removeMark(from, to, markType)
            .addMark(from, to, markType.create({ color })),
        );
      }
      return true;
    });
  }
  removeTextColor() {
    const markType = this.markType('textColor');
    if (!markType) return;
    this.run((state, dispatch) => {
      const { from, to, empty } = state.selection;
      if (empty) {
        dispatch?.(state.tr.removeStoredMark(markType));
      } else {
        dispatch?.(state.tr.removeMark(from, to, markType));
      }
      return true;
    });
  }
  clearFormatting() {
    this.run(clearFormattingCommand);
  }
  undo() {
    this.run(undo);
  }
  redo() {
    this.run(redo);
  }

  paragraph() {
    const paragraph = this.nodeType('paragraph');
    if (paragraph) this.run(setBlockType(paragraph));
  }

  /** Toggles: pressing H2 while already in an H2 turns it back into a paragraph. */
  heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const heading = this.nodeType('heading');
    const paragraph = this.nodeType('paragraph');
    if (!heading || !paragraph) return;
    const b = this.block();
    this.run(
      b.type === 'heading' && b.level === level
        ? setBlockType(paragraph)
        : setBlockType(heading, { level }),
    );
  }

  toggleList(kind: 'bullet_list' | 'ordered_list' | 'task_list') {
    if (!this.nodeType(kind)) return;
    this.run(toggleListCommand(kind));
  }

  toggleTaskList() {
    this.toggleList('task_list');
  }

  blockquote() {
    const blockquote = this.nodeType('blockquote');
    if (blockquote) this.run(wrapIn(blockquote));
  }
  codeBlock() {
    const codeBlock = this.nodeType('code_block');
    if (codeBlock) this.run(setBlockType(codeBlock));
  }

  setCodeBlockLanguage(pos: number, lang: string): void {
    this.run((state, dispatch) => {
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === 'code_block') {
        dispatch?.(
          state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            language: lang,
          }),
        );
        return true;
      }
      return false;
    });
  }

  toggleCodeBlockWrap(pos: number): void {
    this.run((state, dispatch) => {
      const node = state.doc.nodeAt(pos);
      if (node && node.type.name === 'code_block') {
        dispatch?.(
          state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            wrap: !node.attrs['wrap'],
          }),
        );
        return true;
      }
      return false;
    });
  }
  insertCallout(kind: CalloutKind = 'info') {
    const callout = this.nodeType('callout');
    if (callout) this.run(wrapIn(callout, { type: kind }));
  }

  insertText(text: string): void {
    this.run((state, dispatch) => {
      dispatch?.(state.tr.insertText(text).scrollIntoView());
      return true;
    });
  }

  insertDivider() {
    const rule = this.nodeType('horizontal_rule');
    if (!rule) return;
    this.run((state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(rule.create()).scrollIntoView());
      return true;
    });
  }

  insertTable(rows = 3, cols = 3) {
    const { table, table_row, table_cell, table_header } = this.schema.nodes;
    if (!table || !table_row || !table_cell || !table_header) return;
    this.run((state, dispatch) => {
      const body = Array.from({ length: rows }, (_, r) =>
        table_row.create(
          null,
          Array.from({ length: cols }, () =>
            (r === 0 ? table_header : table_cell).createAndFill()!,
          ),
        ),
      );
      dispatch?.(
        state.tr
          .replaceSelectionWith(table.create(null, body))
          .scrollIntoView(),
      );
      return true;
    });
  }

  /** Inserts an image either from an IndexedDB-stored file or an external URL */
  async insertImage(
    fileOrSrc: File | Blob | string,
    alt?: string,
    title?: string,
  ): Promise<void> {
    if (!this.nodeType('image')) return;

    let src: string;
    let defaultAlt = alt || '';
    if (typeof fileOrSrc === 'string') {
      src = fileOrSrc;
    } else {
      defaultAlt =
        defaultAlt || (fileOrSrc instanceof File ? fileOrSrc.name : 'image');
      const saved = await imageStorage.saveImage(fileOrSrc, defaultAlt);
      src = saved.uri;
    }

    // Resolve the type after the await: extensions may have been swapped meanwhile.
    const image = this.nodeType('image');
    if (!image) return;
    this.run((state, dispatch) => {
      dispatch?.(
        state.tr
          .replaceSelectionWith(
            image.create({ src, alt: defaultAlt, title: title ?? null }),
          )
          .scrollIntoView(),
      );
      return true;
    });
  }

  // ── Table operations ─────────────────────────────────────────────
  addRow() {
    this.run(addRowAfter);
  }
  addRowAfter() {
    this.run(addRowAfter);
  }
  addRowBefore() {
    this.run(addRowBefore);
  }
  deleteRow() {
    this.run(deleteRow);
  }
  addColumn() {
    this.run(addColumnAfter);
  }
  addColumnAfter() {
    this.run(addColumnAfter);
  }
  addColumnBefore() {
    this.run(addColumnBefore);
  }
  deleteColumn() {
    this.run(deleteColumn);
  }
  deleteTable() {
    this.run(deleteTable);
  }
  setCellAlignment(alignment: 'left' | 'center' | 'right') {
    this.run(setCellAttr('alignment', alignment));
  }
  setCellBackground(color: string | null) {
    this.run(setCellAttr('background', color));
  }
  toggleHeaderRow() {
    this.run(toggleHeaderRow);
  }

  /** Returns current link href if the selection has a link mark. */
  getLinkHref(): string | null {
    const v = this.view;
    const linkMark = this.markType('link');
    if (!v || !linkMark) return null;
    const { from, to, empty, $from } = v.state.selection;
    if (empty) {
      const mark = linkMark.isInSet(v.state.storedMarks ?? $from.marks());
      return mark ? (mark.attrs['href'] as string) : null;
    }
    let href: string | null = null;
    v.state.doc.nodesBetween(from, to, (node) => {
      const mark = node.marks.find((m) => m.type === linkMark);
      if (mark) href = mark.attrs['href'] as string;
    });
    return href;
  }

  removeLink(): void {
    const linkMark = this.markType('link');
    if (!linkMark) return;
    this.run((state, dispatch) => {
      const { from, to } = state.selection;
      dispatch?.(state.tr.removeMark(from, to, linkMark));
      return true;
    });
  }

  /** Returns false (and does nothing) if the URL protocol is not allowed. */
  setLink(href: string): boolean {
    const safe = sanitizeHref(href);
    const linkMark = this.markType('link');
    if (!safe || !linkMark) return false;
    this.run((state, dispatch) => {
      const { from, to, empty } = state.selection;
      if (empty) {
        dispatch?.(state.tr.addStoredMark(linkMark.create({ href: safe })));
      } else {
        dispatch?.(
          state.tr
            .removeMark(from, to, linkMark)
            .addMark(from, to, linkMark.create({ href: safe })),
        );
      }
      return true;
    });
    return true;
  }

  private run(cmd: Command): void {
    const v = this.view;
    if (!v || !this.editableFlag) return;
    cmd(v.state, v.dispatch, v);
    v.focus();
  }
}

// Modern intent-based alias
export { EditorService as EditorStore };
