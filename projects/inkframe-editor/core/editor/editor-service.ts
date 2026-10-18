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
import { MarkType, Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { redo, redoDepth, undo, undoDepth } from 'prosemirror-history';

import { TextAlign } from '../extensions/text-align/text-align-schema';
import { CalloutKind } from '../extensions/callout/callout-schema';
import { SCHEMA_VERSION, StoredDoc, migrate } from '../schema/migrations';
import { clearFormattingCommand } from '../extensions/clear-formatting/clear-formatting-commands';
import {
  removeHighlightCommand,
  setHighlightCommand,
  toggleHighlightCommand,
} from '../extensions/highlight/highlight-commands';
import { toggleCodeCommand } from '../extensions/marks/marks-commands';
import {
  removeTextColorCommand,
  setTextColorCommand,
} from '../extensions/text-color/text-color-commands';
import { insertDividerCommand } from '../extensions/divider/divider-commands';
import {
  setBlockTypeKeepingAlign,
  setTextAlignCommand,
  textAlignAt,
} from '../extensions/text-align/text-align-commands';
import { ListKind, NumberStyle } from '../extensions/lists/list-schema';
import {
  ListState,
  continueListNumberingCommand,
  liftListItemCommand,
  listStateAt,
  moveListItemCommand,
  restartListNumberingCommand,
  sameListState,
  setBulletStyleCommand,
  setListStartCommand,
  setNumberStyleCommand,
  sinkListItemCommand,
  toggleListCommand,
  toggleTaskCheckedCommand,
} from '../extensions/lists/list-commands';
import {
  findNextCommand,
  findPreviousCommand,
  getSearchState,
  replaceAllCommand,
  replaceCurrentCommand,
  setSearchQueryCommand,
} from '../extensions/search/search.plugin';
import { DocStats, countWords, docStats, docText } from './doc-stats';
import { htmlHasText } from '../extensions/paste-cleanup/paste-cleanup';
import { EditorHooks, FloatingMenuState, SlashMenuState, TableMenuState } from './editor-hooks';
import { slashKey } from './menus.plugin';
import { sanitizeHref } from '../extensions/link/link-utils';
import { linkHrefAt, removeLinkCommand, setLinkCommand } from '../extensions/link/link-commands';
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
import { EditorExtension, SlashItem } from './extension-types';
import { ExtensionManager } from './extension-manager';
import { DEFAULT_EXTENSIONS } from '../extensions/starter-kit';
import { insertTableCommand } from '../extensions/table/table-commands';
import {
  setCodeBlockLanguageCommand,
  toggleCodeBlockWrapCommand,
} from '../extensions/code-block/code-block-commands';
import { insertImageCommand } from '../extensions/image/image-commands';
import {
  DEFAULT_PAGE_SETUP,
  PageSetup,
  normalizePageSetup,
  samePageSetup,
} from '../extensions/page-setup/page-setup';
import { setPageSetupCommand } from '../extensions/page-setup/page-setup-commands';
import { imageStorage } from '../storage/image-storage';

export interface BlockInfo {
  type: string; // 'paragraph' | 'heading' | 'code_block' | ...
  level: number | null; // heading level
  list: ListKind | null; // innermost enclosing list
}

export interface MountOptions {
  doc?: StoredDoc | null;
  editable?: boolean;
  onChange?: () => void;
  extensions?: EditorExtension[];
}

const sameBlock = (a: BlockInfo, b: BlockInfo) =>
  a.type === b.type && a.level === b.level && a.list === b.list;

/** Floating items the floating menu renders itself, so it must not repeat them. */
const BUILT_IN_FLOATING_ITEMS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);

const EMPTY_STATS: DocStats = { words: 0, characters: 0, readingMinutes: 0 };

export interface SelectionRange {
  from: number;
  to: number;
}

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
  /** Whether the document can be edited (false in preview). */
  readonly isEditable = signal(true);

  // ── Modular Extension System ─────────────────────────────────────
  readonly extensions = signal<EditorExtension[]>(DEFAULT_EXTENSIONS);
  readonly extensionManager = computed(() => new ExtensionManager(this.extensions(), this, this));

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
    this.extensionManager()
      .getToolbarItems()
      .filter((item) => !item.group || item.group === 'custom' || item.group === 'action'),
  );

  readonly customFloatingItems = computed(() =>
    this.extensionManager()
      .getFloatingItems()
      .filter((item) => !BUILT_IN_FLOATING_ITEMS.has(item.id)),
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
  /** Highlight color of the selection, or null when it has none. */
  readonly currentHighlight = signal<string | null>(null);
  /** Alignment of the block at the cursor; null where blocks cannot be aligned (code blocks). */
  readonly textAlign = signal<TextAlign | null>('left');
  readonly block = signal<BlockInfo>(
    { type: 'paragraph', level: null, list: null },
    { equal: sameBlock },
  );
  /** The list at the cursor (type, styles, what can be done with it), or null outside lists. */
  readonly listState = signal<ListState | null>(null, { equal: sameListState });
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly isInTable = signal(false);

  // ── Document statistics ──────────────────────────────────────────
  /** The current document; replaced (never mutated) on every change. */
  readonly doc = signal<PMNode | null>(null);
  readonly selection = signal<SelectionRange>(
    { from: 0, to: 0 },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );
  /** Words, characters and reading time. Computed lazily, when something reads it. */
  readonly stats = computed(() => {
    const doc = this.doc();
    return doc ? docStats(doc) : EMPTY_STATS;
  });
  /** Words in the selection, or null when nothing is selected. */
  readonly selectionWords = computed(() => {
    const doc = this.doc();
    const { from, to } = this.selection();
    return doc && from !== to ? countWords(docText(doc, from, to)) : null;
  });

  // ── Page setup ───────────────────────────────────────────────────
  /** The page setup the document stores, or null when it has none. */
  readonly storedPageSetup = computed(
    () => {
      const doc = this.doc();
      return doc ? normalizePageSetup(doc.attrs['page']) : null;
    },
    { equal: samePageSetup },
  );
  /** The document's page setup; the default (Pageless) when it has none. */
  readonly pageSetup = computed(() => this.storedPageSetup() ?? DEFAULT_PAGE_SETUP);
  /**
   * A page setup shown on screen but not applied yet: the margins while a
   * ruler handle is being dragged. Null otherwise.
   */
  readonly pageSetupPreview = signal<PageSetup | null>(null);
  /** Incremented to open the Page setup dialog (`<ink-editor>` reacts to it). */
  readonly pageSetupRequests = signal(0);

  requestPageSetup(): void {
    this.pageSetupRequests.update((n) => n + 1);
  }

  /**
   * Changes the page setup in one undo step; null removes it. Returns whether
   * anything changed. Focus stays where it is (the dialog restores it).
   */
  setPageSetup(setup: PageSetup | null): boolean {
    const v = this.view;
    if (!v || !this.editableFlag) return false;
    return setPageSetupCommand(setup)(v.state, v.dispatch, v);
  }

  // ── Find and replace ─────────────────────────────────────────────
  readonly searchOpen = signal(false);
  readonly searchReplaceVisible = signal(false);
  /** Incremented to move focus to the find field (the panel reacts to it). */
  readonly searchFocusRequests = signal(0);
  readonly searchQuery = signal('');
  readonly searchCaseSensitive = signal(false);
  readonly searchMatchCount = signal(0);
  /** Index of the current match, or -1. */
  readonly searchCurrent = signal(-1);

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
    equal: (a, b) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top),
  });

  readonly floatingMenu = signal<FloatingMenuState | null>(null, {
    equal: (a, b) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top),
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
        a.top === b.top &&
        a.placement === b.placement &&
        a.maxHeight === b.maxHeight),
  });
  readonly slashActive = signal(0);
  readonly slashItems = computed(() => {
    const q = this.slashMenu()?.query.toLowerCase() ?? '';
    const items = this.extensionManager().getSlashItems();
    return items.filter(
      (i) => !q || i.label.toLowerCase().includes(q) || i.keywords.some((k) => k.startsWith(q)),
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
    this.isEditable.set(this.editableFlag);
    const afterUpdate = (state: EditorState, docChanged: boolean) =>
      this.afterUpdate(state, docChanged);

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
      handlePaste: (_view, event) => {
        const data = event.clipboardData;
        // Word, Excel and others also put a picture of the copied text on
        // the clipboard. Paste the text then; take the file only when the
        // HTML is just an image (e.g. "Copy image" in a browser).
        if (htmlHasText(data?.getData('text/html') ?? '')) return false;
        return this.handleImageFiles(event, data?.files);
      },
      handleDrop: (_view, event) => this.handleImageFiles(event, event.dataTransfer?.files),
      // A plain function: ProseMirror calls it with the view as `this`, also
      // during construction, before `this.view` is assigned.
      dispatchTransaction(this: EditorView, tr) {
        const next = this.state.apply(tr);
        this.updateState(next);
        afterUpdate(next, tr.docChanged);
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
    this.searchOpen.set(false); // matches belonged to the previous document
    this.syncSignals(state);
  }

  setEditable(editable: boolean): void {
    this.editableFlag = editable;
    this.isEditable.set(editable);
    if (this.view) {
      this.view.setProps({ editable: () => this.editableFlag });
      this.view.dom.classList.toggle('ProseMirror-preview', !editable);
      if (!editable) {
        this.view.dom.blur();
        this.floatingMenu.set(null);
        this.slashMenu.set(null);
        this.tableMenu.set(null);
        if (this.searchOpen()) {
          this.searchOpen.set(false);
          const v = this.view;
          setSearchQueryCommand('', { caseSensitive: this.searchCaseSensitive() })(
            v.state,
            v.dispatch,
          );
        }
      }
    }
  }

  private createState(stored?: StoredDoc | null, plugins?: readonly Plugin[]) {
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

    const highlightMark = state.schema.marks['highlight'];
    let highlight: string | null = null;
    if (highlightMark) {
      if (empty) {
        const mark = highlightMark.isInSet(state.storedMarks ?? $from.marks());
        if (mark) highlight = (mark.attrs['color'] as string) ?? null;
      } else {
        state.doc.nodesBetween(from, to, (node) => {
          const mark = highlightMark.isInSet(node.marks);
          if (mark) highlight = (mark.attrs['color'] as string) ?? null;
        });
      }
    }
    this.currentHighlight.set(highlight);
    this.textAlign.set(textAlignAt(state));

    this.doc.set(state.doc);
    this.selection.set({ from, to });

    const search = getSearchState(state);
    this.searchQuery.set(search?.query ?? '');
    this.searchCaseSensitive.set(search?.caseSensitive ?? false);
    this.searchMatchCount.set(search?.matches.length ?? 0);
    this.searchCurrent.set(search?.current ?? -1);

    let list: BlockInfo['list'] = null;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === 'bullet_list' || name === 'ordered_list' || name === 'task_list') {
        list = name;
        break;
      }
    }
    const parent = $from.parent;
    this.block.set({
      type: parent.type.name,
      level: parent.type.name === 'heading' ? (parent.attrs['level'] as number) : null,
      list,
    });

    this.listState.set(listStateAt(state));
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
        this.view?.dispatch(this.view.state.tr.setMeta(slashKey, { dismiss: true }));
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
    if (!this.markType('code')) return;
    this.run(toggleCodeCommand);
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
    if (!this.markType('textColor') || this.isCode()) return;
    this.run(setTextColorCommand(color));
  }
  removeTextColor() {
    if (!this.markType('textColor')) return;
    this.run(removeTextColorCommand);
  }
  /** Highlights the selection; inline code cannot be highlighted. */
  setHighlight(color: string) {
    if (!this.markType('highlight') || this.isCode()) return;
    this.run(setHighlightCommand(color));
  }
  removeHighlight() {
    this.run(removeHighlightCommand);
  }
  toggleHighlight() {
    if (!this.markType('highlight') || this.isCode()) return;
    this.run(toggleHighlightCommand);
  }
  /** Aligns the paragraphs and headings in the selection (`left` is the default). */
  setTextAlign(align: TextAlign) {
    this.run(setTextAlignCommand(align));
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
    if (paragraph) this.run(setBlockTypeKeepingAlign(paragraph));
  }

  /** Toggles: pressing H2 while already in an H2 turns it back into a paragraph. */
  heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const heading = this.nodeType('heading');
    const paragraph = this.nodeType('paragraph');
    if (!heading || !paragraph) return;
    const b = this.block();
    this.run(
      b.type === 'heading' && b.level === level
        ? setBlockTypeKeepingAlign(paragraph)
        : setBlockTypeKeepingAlign(heading, { level }),
    );
  }

  toggleList(kind: ListKind) {
    if (!this.nodeType(kind)) return;
    this.run(toggleListCommand(kind));
  }

  toggleTaskList() {
    this.toggleList('task_list');
  }

  /** Nests the list items in the selection under the item before them (Tab). */
  indentListItem() {
    this.run(sinkListItemCommand());
  }

  /** Moves the list items in the selection one level out (Shift+Tab). */
  outdentListItem() {
    this.run(liftListItemCommand);
  }

  /** Moves the list items in the selection past their neighbor (Alt+Shift+Up/Down). */
  moveListItem(direction: 'up' | 'down') {
    this.run(moveListItemCommand(direction));
  }

  /** Checks or unchecks the tasks in the selection (Ctrl+Enter). */
  toggleTaskChecked() {
    this.run(toggleTaskCheckedCommand);
  }

  /** Restarts the numbering at the item at the cursor, from `start`. */
  setListStart(start: number) {
    this.run(setListStartCommand(start));
  }

  restartListNumbering() {
    this.run(restartListNumberingCommand);
  }

  /** Continues the numbering of the numbered list before this one. */
  continueListNumbering() {
    this.run(continueListNumberingCommand);
  }

  /** A named bullet style, a custom symbol, or null for bullets by depth. */
  setBulletStyle(style: string | null) {
    this.run(setBulletStyleCommand(style));
  }

  setNumberStyle(style: NumberStyle | null) {
    this.run(setNumberStyleCommand(style));
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
    this.run(setCodeBlockLanguageCommand(pos, lang));
  }

  toggleCodeBlockWrap(pos: number): void {
    this.run(toggleCodeBlockWrapCommand(pos));
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
    if (!this.nodeType('horizontal_rule')) return;
    this.run(insertDividerCommand);
  }

  insertTable(rows = 3, cols = 3) {
    if (!this.nodeType('table')) return;
    this.run(insertTableCommand(rows, cols));
  }

  /** Inserts an image either from an IndexedDB-stored file or an external URL */
  async insertImage(fileOrSrc: File | Blob | string, alt?: string, title?: string): Promise<void> {
    if (!this.nodeType('image')) return;

    let src: string;
    let defaultAlt = alt || '';
    if (typeof fileOrSrc === 'string') {
      src = fileOrSrc;
    } else {
      defaultAlt = defaultAlt || (fileOrSrc instanceof File ? fileOrSrc.name : 'image');
      const saved = await imageStorage.saveImage(fileOrSrc, defaultAlt);
      src = saved.uri;
    }

    // Check again after the await: extensions may have been swapped meanwhile.
    if (!this.nodeType('image')) return;
    this.run(insertImageCommand(src, defaultAlt, title ?? null));
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
    return v ? linkHrefAt(v.state) : null;
  }

  removeLink(): void {
    if (!this.markType('link')) return;
    this.run(removeLinkCommand);
  }

  /** Returns false (and does nothing) if the URL protocol is not allowed. */
  setLink(href: string): boolean {
    if (!sanitizeHref(href) || !this.markType('link')) return false;
    this.run(setLinkCommand(href));
    return true;
  }

  // ── Find and replace ─────────────────────────────────────────────
  /**
   * Opens the find panel (with the replace field when `replace` is set) and
   * moves focus to it. A one-line selection becomes the search text.
   */
  openSearch(options: { replace?: boolean } = {}): void {
    const v = this.view;
    if (!v || !this.editableFlag || !getSearchState(v.state)) return;
    const { from, to, empty } = v.state.selection;
    const selected = empty ? '' : v.state.doc.textBetween(from, to, '\n');
    if (selected.trim() && !selected.includes('\n') && selected.length <= 200) {
      this.setSearchQuery(selected);
    } else if (!this.searchOpen() && this.lastSearchQuery) {
      // Reopening: search again for the previous text, starting at the cursor.
      this.setSearchQuery(this.lastSearchQuery);
    }
    this.searchOpen.set(true);
    if (options.replace) this.searchReplaceVisible.set(true);
    this.searchFocusRequests.update((n) => n + 1);
  }

  /** Closes the panel, clears the match highlights and returns focus to the document. */
  closeSearch(): void {
    if (!this.searchOpen()) return;
    this.searchOpen.set(false);
    const v = this.view;
    if (!v) return;
    // Clear the highlights; the query is kept for the next openSearch().
    setSearchQueryCommand('', { caseSensitive: this.searchCaseSensitive() })(v.state, v.dispatch);
    v.focus();
  }

  toggleSearchReplace(): void {
    this.searchReplaceVisible.update((visible) => !visible);
  }

  private lastSearchQuery = '';

  /** Searches for `query` and selects the first match at or after the cursor. */
  setSearchQuery(query: string, caseSensitive = this.searchCaseSensitive()): void {
    this.lastSearchQuery = query;
    this.dispatchSearch(setSearchQueryCommand(query, { caseSensitive }));
  }

  findNext(): void {
    this.dispatchSearch(findNextCommand);
  }

  findPrevious(): void {
    this.dispatchSearch(findPreviousCommand);
  }

  /** Replaces the current match and moves to the next one. */
  replaceCurrent(replacement: string): void {
    if (!this.editableFlag) return;
    this.dispatchSearch(replaceCurrentCommand(replacement));
  }

  /** Replaces every match in one undoable step. Returns the number replaced. */
  replaceAll(replacement: string): number {
    const v = this.view;
    const count = v ? (getSearchState(v.state)?.matches.length ?? 0) : 0;
    if (!this.editableFlag || !count) return 0;
    this.dispatchSearch(replaceAllCommand(replacement));
    return count;
  }

  /**
   * Runs a search command without moving focus into the document (the find
   * field keeps it), then scrolls the current match into view.
   */
  private dispatchSearch(cmd: Command): void {
    const v = this.view;
    if (!v) return;
    cmd(v.state, v.dispatch, v);
    const search = getSearchState(v.state);
    const match = search?.matches[search.current];
    if (match) this.scrollIntoView(match.from);
  }

  /**
   * Centres `pos` in the editor's scroll area when it is out of view or under
   * the find panel. (ProseMirror's own scrollIntoView starts from the DOM
   * selection, which is in the find field while the panel has focus.)
   */
  private scrollIntoView(pos: number): void {
    const v = this.view;
    if (!v) return;
    try {
      const coords = v.coordsAtPos(pos);
      const scroller = v.dom.closest<HTMLElement>('.ink-editor-viewport');
      if (!scroller) {
        const { node } = v.domAtPos(pos);
        (node.nodeType === 1 ? (node as Element) : node.parentElement)?.scrollIntoView?.({
          block: 'center',
        });
        return;
      }
      const bounds = scroller.getBoundingClientRect();
      const panelClearance = 96;
      if (coords.top < bounds.top + panelClearance || coords.bottom > bounds.bottom - 24) {
        scroller.scrollTop += coords.top - (bounds.top + bounds.height / 2);
      }
    } catch {
      // No layout (e.g. jsdom) or a view being destroyed: nothing to scroll.
    }
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
