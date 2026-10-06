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
import { MarkType } from 'prosemirror-model';
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import {
  redo,
  redoDepth,
  undo,
  undoDepth,
} from 'prosemirror-history';

import { CalloutKind, schema } from './core/schema';
import { SCHEMA_VERSION, StoredDoc, migrate } from './core/migrations';
import { buildPlugins, clearFormattingCommand, toggleListCommand } from './core/plugins';
import {
  EditorHooks,
  FloatingMenuState,
  SlashMenuState,
} from './core/editor-hooks';
import { slashKey } from './core/menus.plugin';
import { sanitizeHref } from './core/link-utils';
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
} from 'prosemirror-tables';
import { SLASH_ITEMS, SlashItem } from './slash-menu/slash-items';
import { CalloutNodeView } from './node-views/callout.node-view';
import { ImageNodeView } from './node-views/image.node-view';
import { TaskItemNodeView } from './node-views/task-item.node-view';
import { imageStorage } from './core/image-storage';

export interface BlockInfo {
  type: string; // 'paragraph' | 'heading' | 'code_block' | ...
  level: number | null; // heading level
  list: 'bullet_list' | 'ordered_list' | 'task_list' | null; // innermost enclosing list
}

export interface MountOptions {
  doc?: StoredDoc | null;
  editable?: boolean;
  onChange?: () => void;
}

const sameBlock = (a: BlockInfo, b: BlockInfo) =>
  a.type === b.type && a.level === b.level && a.list === b.list;

@Injectable()
export class EditorService implements EditorHooks {
  private readonly env = inject(EnvironmentInjector);
  private readonly appRef = inject(ApplicationRef);

  view?: EditorView;
  private onChange?: () => void;
  private editableFlag = true;

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
    return SLASH_ITEMS.filter(
      (i) =>
        !q ||
        i.label.toLowerCase().includes(q) ||
        i.keywords.some((k) => k.startsWith(q)),
    );
  });

  // ── Lifecycle ────────────────────────────────────────────────────
  mount(el: HTMLElement, opts: MountOptions = {}): void {
    this.onChange = opts.onChange;
    this.editableFlag = opts.editable ?? true;
    const self = this;

    // Created outside Angular's zone by virtue of being called from afterNextRender
    // and only touching signals from callbacks (see section 2.1, rule 2).
    this.view = new EditorView(el, {
      state: this.createState(opts.doc),
      editable: () => this.editableFlag,
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Document editor',
      },
      nodeViews: {
        callout: (node, view, getPos) =>
          new CalloutNodeView(node, view, getPos, this.env, this.appRef),
        image: (node, view, getPos) =>
          new ImageNodeView(node, view, getPos),
        task_item: (node, view, getPos) =>
          new TaskItemNodeView(node, view, getPos),
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            this.insertImage(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            this.insertImage(file);
            return true;
          }
        }
        return false;
      },
      dispatchTransaction(this: EditorView, tr) {
        const next = this.state.apply(tr);
        this.updateState(next);
        self.afterUpdate(next, tr.docChanged);
      },
    });
    this.syncSignals(this.view.state);
  }

  destroy(): void {
    this.view?.destroy();
    this.view = undefined;
  }

  focus(): void {
    this.view?.focus();
  }

  // ── Document IO ──────────────────────────────────────────────────
  getJSON(): StoredDoc {
    return {
      schemaVersion: SCHEMA_VERSION,
      doc: this.view!.state.doc.toJSON(),
    };
  }

  /** Replace the whole document (loads fresh state, resets undo history). */
  setDoc(stored: StoredDoc): void {
    const v = this.view;
    if (!v) return;
    const state = this.createState(stored, v.state.plugins);
    v.updateState(state);
    this.syncSignals(state);
  }

  setEditable(editable: boolean): void {
    this.editableFlag = editable;
    this.view?.setProps({ editable: () => editable });
  }

  private createState(
    stored?: StoredDoc | null,
    plugins: readonly Plugin[] = buildPlugins(this),
  ) {
    const doc = stored ? schema.nodeFromJSON(migrate(stored)) : undefined;
    return EditorState.create({ schema, doc, plugins });
  }

  private afterUpdate(state: EditorState, docChanged: boolean): void {
    this.syncSignals(state);
    if (docChanged) this.onChange?.();
  }

  private syncSignals(state: EditorState): void {
    const { from, to, empty, $from } = state.selection;
    const active = (type: MarkType) =>
      empty
        ? !!type.isInSet(state.storedMarks ?? $from.marks())
        : state.doc.rangeHasMark(from, to, type);

    this.isBold.set(active(schema.marks['strong']));
    this.isItalic.set(active(schema.marks['em']));
    this.isCode.set(active(schema.marks['code']));
    this.isLink.set(active(schema.marks['link']));
    this.isUnderline.set(active(schema.marks['underline']));
    this.isStrike.set(active(schema.marks['strikethrough']));
    this.isSubscript.set(active(schema.marks['subscript']));
    this.isSuperscript.set(active(schema.marks['superscript']));
    this.isSmall.set(active(schema.marks['small']));

    const textColorMark = schema.marks['textColor'];
    let color: string | null = null;
    if (empty) {
      const mark = textColorMark.isInSet(state.storedMarks ?? $from.marks());
      if (mark) color = (mark.attrs['color'] as string) ?? null;
    } else {
      state.doc.nodesBetween(from, to, (node) => {
        const mark = node.marks.find((m) => m.type === textColorMark);
        if (mark) color = (mark.attrs['color'] as string) ?? null;
      });
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
  toggleBold() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['strong']));
  }
  toggleItalic() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['em']));
  }
  toggleCode() {
    const codeType = schema.marks['code'];
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
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['underline']));
  }
  toggleStrike() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['strikethrough']));
  }
  toggleSubscript() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['subscript']));
  }
  toggleSuperscript() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['superscript']));
  }
  toggleSmall() {
    if (this.isCode()) return;
    this.run(toggleMark(schema.marks['small']));
  }
  setTextColor(color: string) {
    if (this.isCode()) return;
    const markType = schema.marks['textColor'];
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
    const markType = schema.marks['textColor'];
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
    this.run(setBlockType(schema.nodes['paragraph']));
  }

  /** Toggles: pressing H2 while already in an H2 turns it back into a paragraph. */
  heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const b = this.block();
    this.run(
      b.type === 'heading' && b.level === level
        ? setBlockType(schema.nodes['paragraph'])
        : setBlockType(schema.nodes['heading'], { level }),
    );
  }

  toggleList(kind: 'bullet_list' | 'ordered_list' | 'task_list') {
    this.run(toggleListCommand(kind));
  }

  toggleTaskList() {
    this.toggleList('task_list');
  }

  blockquote() {
    this.run(wrapIn(schema.nodes['blockquote']));
  }
  codeBlock() {
    this.run(setBlockType(schema.nodes['code_block']));
  }
  insertCallout(kind: CalloutKind = 'info') {
    this.run(wrapIn(schema.nodes['callout'], { type: kind }));
  }

  insertDivider() {
    this.run((state, dispatch) => {
      dispatch?.(
        state.tr
          .replaceSelectionWith(schema.nodes['horizontal_rule'].create())
          .scrollIntoView(),
      );
      return true;
    });
  }

  insertTable(rows = 3, cols = 3) {
    const { table, table_row, table_cell, table_header } = schema.nodes;
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
    const { image } = schema.nodes;
    if (!image) return;

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
  deleteRow() {
    this.run(deleteRow);
  }
  addColumn() {
    this.run(addColumnAfter);
  }
  deleteColumn() {
    this.run(deleteColumn);
  }
  deleteTable() {
    this.run(deleteTable);
  }

  /** Returns current link href if the selection has a link mark. */
  getLinkHref(): string | null {
    const v = this.view;
    if (!v) return null;
    const { from, to, empty, $from } = v.state.selection;
    const linkMark = schema.marks['link'];
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
    const linkMark = schema.marks['link'];
    this.run((state, dispatch) => {
      const { from, to } = state.selection;
      dispatch?.(state.tr.removeMark(from, to, linkMark));
      return true;
    });
  }

  /** Returns false (and does nothing) if the URL protocol is not allowed. */
  setLink(href: string): boolean {
    const safe = sanitizeHref(href);
    if (!safe) return false;
    this.run(toggleMark(schema.marks['link'], { href: safe }));
    return true;
  }

  private run(cmd: Command): void {
    const v = this.view;
    if (!v || !this.editableFlag) return;
    cmd(v.state, v.dispatch, v);
    v.focus();
  }
}
