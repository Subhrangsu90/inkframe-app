# Inkframe: Rich-Text Editor for Angular (ProseMirror)

| | |
| --- | --- |
| **Product name** | Inkframe *(working name; rename by find-and-replace of `Inkframe` / `inkframe` and the `ink-` selector prefix)* |
| **Tagline** | A signal-driven, schema-first rich-text editor you fully own. |
| **Package (suggested)** | `@inkframe/editor` |
| **Component selector** | `<ink-editor>` |
| **Document version** | 2.0 (revised after technical review) |
| **Status** | Plan + reference implementation |
| **Stack** | Angular 18+ (standalone, signals), TypeScript 5.x, ProseMirror, Yjs (later phase) |

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Setup](#3-setup)
4. [Project structure](#4-project-structure)
5. [Core: schema, versioning, link safety](#5-core-schema-versioning-link-safety)
6. [Core: editor hooks, plugins, input rules](#6-core-editor-hooks-plugins-input-rules)
7. [Core: menus plugin (floating + slash)](#7-core-menus-plugin-floating--slash)
8. [Angular layer: service](#8-angular-layer-service)
9. [Angular layer: components](#9-angular-layer-components)
10. [Angular components inside NodeViews](#10-angular-components-inside-nodeviews)
11. [Storage, import/export, security](#11-storage-importexport-security)
12. [Accessibility](#12-accessibility)
13. [Collaboration (Yjs)](#13-collaboration-yjs)
14. [Testing](#14-testing)
15. [Roadmap](#15-roadmap)
16. [Risks and open decisions](#16-risks-and-open-decisions)
17. [Pitfalls checklist](#17-pitfalls-checklist)
18. [Changelog: what was fixed from the original plan](#18-changelog-what-was-fixed-from-the-original-plan)
19. [Resources](#19-resources)

---

## 1. Overview

### 1.1 Purpose

Inkframe is a custom rich-text editor for Angular applications. ProseMirror is the editing engine. Angular owns all UI: toolbar, floating menu, slash menu, dialogs, and custom block rendering. You own the schema and every feature.

### 1.2 Goals

- A document model (schema) you control, stored as versioned JSON.
- Zero duplicated document state: ProseMirror is the single source of truth.
- Good performance: the editor runs outside Angular's zone, and signals update only when values change.
- Accessible by default (keyboard operable toolbar, ARIA roles, menu navigation).
- A path to real-time collaboration without a rewrite.

### 1.3 Non-goals

- Not a drop-in WYSIWYG product with every feature on day one.
- Not a Markdown-only editor (Markdown is an input/output format, not the storage format).
- No server component in this document (persistence and collab backend are out of scope except where noted).

### 1.4 Functional requirements

| ID | Requirement |
| --- | --- |
| F1 | Paragraphs, headings (1-6), bold, italic, inline code, links |
| F2 | Bullet and ordered lists with correct Enter, Tab, Shift-Tab behavior |
| F3 | Undo/redo, keyboard shortcuts, Markdown-style input rules |
| F4 | Toolbar with active states; floating selection menu; slash menu |
| F5 | Code block, blockquote, divider, callout, tables |
| F6 | Images (upload), mentions *(later phase)* |
| F7 | Import/export HTML (and Markdown, later); read-only mode |
| F8 | Real-time collaboration and comments *(later phase)* |

### 1.5 Non-functional requirements

| ID | Requirement |
| --- | --- |
| N1 | Typing latency is unaffected by app size (no change detection per keystroke) |
| N2 | WCAG 2.1 AA for toolbar and menus |
| N3 | Saved documents always load (schema migrations are mandatory) |
| N4 | No script execution from stored or pasted content (XSS-safe) |
| N5 | SSR-safe (editor mounts only in the browser) |

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────┐
│ Angular UI layer                                      │
│  <ink-editor> · Toolbar · FloatingMenu · SlashMenu    │
│  LinkDialog · Angular components in NodeViews         │
├───────────────────────────────────────────────────────┤
│ Bridge: EditorService (signals, implements hooks)     │
│  state → signals (marks, block, undo, menus)          │
│  UI → commands                                        │
├───────────────────────────────────────────────────────┤
│ ProseMirror core                                      │
│  schema · plugins · commands · input rules · EditorView│
└───────────────────────────────────────────────────────┘
```

### 2.1 Rules

1. **ProseMirror is the source of truth.** Angular reads state through signals and dispatches commands. Never keep a second copy of the document.
2. **The view lives outside Angular's zone.** Signals are written from ProseMirror callbacks; Angular 18+ schedules change detection when a signal read by a template changes, so no `zone.run` per transaction is needed. (On Angular 17, wrap signal writes in `zone.run`.)
3. **Plugins talk to Angular through an `EditorHooks` object**, never by importing Angular services directly. This keeps `core/` framework-free and unit-testable.
4. **Signals use equality comparators** so unchanged values do not trigger re-renders.
5. **Documents are stored as a versioned JSON envelope** (`{ schemaVersion, doc }`).

### 2.2 Data flow

```
user input → ProseMirror transaction → dispatchTransaction
           → state.apply → view.updateState
           → syncSignals (marks/block/undo) ──→ toolbar re-renders
           → plugin view.update ─→ hooks ─────→ menu signals ─→ menus render
           → (doc changed) onChange ─→ debounce ─→ <ink-editor> (changed) output
```

---

## 3. Setup

### 3.1 Install

```bash
ng new inkframe-app --standalone --style=scss
cd inkframe-app

npm i prosemirror-model prosemirror-state prosemirror-view prosemirror-transform \
      prosemirror-commands prosemirror-keymap prosemirror-history prosemirror-inputrules \
      prosemirror-schema-basic prosemirror-schema-list prosemirror-tables \
      prosemirror-dropcursor prosemirror-gapcursor

npm i dompurify                      # import/paste sanitization (v3.2+ ships its own types)
npm i -D prosemirror-test-builder    # unit-testing helper
```

### 3.2 Global styles (all three are required)

In `angular.json` → `projects.<app>.architect.build.options.styles`:

```json
"styles": [
  "node_modules/prosemirror-view/style/prosemirror.css",
  "node_modules/prosemirror-gapcursor/style/gapcursor.css",
  "node_modules/prosemirror-tables/style/tables.css",
  "src/styles.scss"
]
```

Without `gapcursor.css` the gap cursor is invisible; without `tables.css` cell selection and column resizing look broken.

### 3.3 Minimal editor CSS (`styles.scss`)

```scss
.ProseMirror { outline: none; min-height: 10rem; padding: 1rem; }
.ink-toolbar button.active { background: #e6e6ff; }
.callout { border-left: 4px solid #888; padding: .5rem .75rem; margin: .5rem 0; display: flex; gap: .5rem; }
.callout-info { border-color: #3b82f6; }
.callout-warning { border-color: #f59e0b; }
.callout-success { border-color: #22c55e; }
.callout-danger { border-color: #ef4444; }
.callout-body { flex: 1; min-width: 0; }
.ink-floating { position: fixed; transform: translate(-50%, calc(-100% - 8px)); z-index: 50; }
.ink-slash { position: fixed; z-index: 50; margin: 4px 0 0; padding: .25rem; list-style: none; background: #fff; border: 1px solid #ddd; border-radius: 6px; max-height: 18rem; overflow: auto; }
.ink-slash li { padding: .35rem .5rem; cursor: pointer; display: flex; flex-direction: column; }
.ink-slash li.active { background: #eef; }
```

`position: fixed` is used because `coordsAtPos` and `getBoundingClientRect` return viewport coordinates. If an ancestor has a CSS `transform`, fixed positioning breaks; render the menus through CDK Overlay in that case.

### 3.4 SSR

If you enable SSR, the editor must mount only in the browser. The component below uses `afterNextRender`, which runs only in the browser.

---

## 4. Project structure

```
src/app/editor/
  index.ts                         # public API barrel
  editor.component.ts              # <ink-editor>
  editor.service.ts                # signal bridge + commands
  core/                            # framework-free ProseMirror code
    schema.ts
    link-utils.ts
    migrations.ts
    editor-hooks.ts
    plugins.ts
    input-rules.ts
    menus.plugin.ts
  node-views/
    callout.node-view.ts
    callout-icon.component.ts
  toolbar/toolbar.component.ts
  floating-menu/floating-menu.component.ts
  slash-menu/
    slash-menu.component.ts
    slash-items.ts
  io/html.ts                       # sanitized import/export
```

---

## 5. Core: schema, versioning, link safety

The schema is the foundation. Design it carefully; renaming nodes later requires a migration.

### 5.1 `core/link-utils.ts`: allow-list for link URLs

`schema-basic` accepts any `href`, including `javascript:`. Inkframe allow-lists protocols instead.

```ts
const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

/** Returns a safe href or null. Allow-list only. */
export function sanitizeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (href.startsWith('/') || href.startsWith('#')) return href;
  return SAFE_PROTOCOL.test(href) ? href : null;
}
```

### 5.2 `core/schema.ts`

```ts
import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';
import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';
import { sanitizeHref } from './link-utils';

export type CalloutKind = 'info' | 'warning' | 'success' | 'danger';
export const CALLOUT_KINDS: CalloutKind[] = ['info', 'warning', 'success', 'danger'];

// addListNodes() needs an OrderedMap (it calls .append()), not a plain object,
// so build a base schema first and use its spec.
const base = new Schema({ nodes: basicNodes, marks: basicMarks });

const callout: NodeSpec = {
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { type: { default: 'info' } },
  parseDOM: [{
    tag: 'div[data-callout]',
    getAttrs: (d) => {
      const kind = (d as HTMLElement).dataset['callout'] as CalloutKind;
      return { type: CALLOUT_KINDS.includes(kind) ? kind : 'info' };
    },
    contentElement: '.callout-body',
  }],
  toDOM: (n) => ['div', { 'data-callout': n.attrs['type'], class: `callout callout-${n.attrs['type']}` }, ['div', { class: 'callout-body' }, 0]],
};

const link: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [{
    tag: 'a[href]',
    getAttrs: (dom) => {
      const el = dom as HTMLElement;
      const href = sanitizeHref(el.getAttribute('href'));
      return href ? { href, title: el.getAttribute('title') } : false; // false = drop the mark
    },
  }],
  toDOM: (mark) => ['a', {
    href: sanitizeHref(mark.attrs['href']) ?? '#',
    title: mark.attrs['title'],
    rel: 'noopener noreferrer nofollow',
    target: '_blank',
  }, 0],
};

const nodes = addListNodes(base.spec.nodes, 'paragraph block*', 'block')
  .append(tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }))
  .addToEnd('callout', callout);

export const schema = new Schema({
  nodes,
  marks: base.spec.marks.update('link', link),
});
```

Start with the basic nodes and add custom ones (callout now; panel and mention later) as separate node specs. The callout's `toDOM` wraps its content in `.callout-body` so a NodeView (section 10) and plain HTML export render the same structure.

### 5.3 `core/migrations.ts`: schema versioning

```ts
export const SCHEMA_VERSION = 1;

/** The envelope that is saved to your database. */
export interface StoredDoc {
  schemaVersion: number;
  doc: unknown; // ProseMirror JSON
}

type Migration = (doc: any) => any;

/** migrations[n] upgrades a document from version n to n + 1. */
const migrations: Record<number, Migration> = {
  // 1: (doc) => renameNode(doc, 'old_name', 'new_name'),
};

export function migrate(stored: StoredDoc): unknown {
  let version = stored.schemaVersion ?? 1;
  let doc = stored.doc;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Document is from a newer schema (v${version}); app supports v${SCHEMA_VERSION}`);
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from schema v${version}`);
    doc = step(doc);
    version++;
  }
  return doc;
}
```

Rule: **every** change that renames, removes, or restructures a node or mark bumps `SCHEMA_VERSION` and adds a migration, with a test using a saved fixture of the old format.

---

## 6. Core: editor hooks, plugins, input rules

### 6.1 `core/editor-hooks.ts`: the plugin ↔ Angular contract

```ts
export interface FloatingMenuState { left: number; top: number; }
export interface SlashMenuState { query: string; from: number; to: number; left: number; top: number; }

export interface EditorHooks {
  onFloatingMenu(state: FloatingMenuState | null): void;
  onSlashMenu(state: SlashMenuState | null): void;
  /** Return true if the key was consumed by the slash menu. */
  onSlashKeyDown(event: KeyboardEvent): boolean;
}
```

### 6.2 `core/plugins.ts`

Order matters: input rules first, then history, then keymaps (most specific first), `baseKeymap` last.

```ts
import { Command } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { splitListItem, sinkListItem, liftListItem } from 'prosemirror-schema-list';
import { undoInputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { schema } from './schema';
import { buildInputRules } from './input-rules';
import { menusPlugin } from './menus.plugin';
import { EditorHooks } from './editor-hooks';

const hardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes['hard_break'].create()).scrollIntoView());
  return true;
};

export function buildPlugins(hooks: EditorHooks): Plugin[] {
  const { strong, em, code } = schema.marks;
  const { list_item } = schema.nodes;

  return [
    buildInputRules(),
    history(),
    menusPlugin(hooks),                         // before keymaps so the slash menu sees keys first
    keymap({ Backspace: undoInputRule }),       // one Backspace undoes an auto-conversion
    keymap({                                    // tables first: Tab returns false outside a table
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
    }),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': toggleMark(strong),
      'Mod-i': toggleMark(em),
      'Mod-e': toggleMark(code),
      'Shift-Enter': hardBreak,
      Enter: splitListItem(list_item),          // new bullet; empty item exits the list
      Tab: sinkListItem(list_item),
      'Shift-Tab': liftListItem(list_item),
    }),
    keymap(baseKeymap),
    dropCursor(),
    gapCursor(),
    columnResizing(),
    tableEditing(),
  ];
}
```

> Why `splitListItem`: `baseKeymap`'s Enter splits the paragraph *inside* the same list item, so without this binding pressing Enter in a list never creates a new bullet.

### 6.3 `core/input-rules.ts`

```ts
import {
  inputRules, InputRule, wrappingInputRule, textblockTypeInputRule,
} from 'prosemirror-inputrules';
import { MarkType } from 'prosemirror-model';
import { schema } from './schema';

/** Wraps text matched by group 1 in a mark: **bold**, _italic_, `code`. */
function markRule(re: RegExp, type: MarkType): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const inner = match[1];
    const lead = /^\s/.test(match[0]) ? 1 : 0;   // some patterns capture one leading space
    const from = start + lead;
    return state.tr
      .delete(from, end)
      .insertText(inner, from)
      .addMark(from, from + inner.length, type.create())
      .removeStoredMark(type);                   // do not keep typing in the mark
  });
}

export const buildInputRules = () => {
  const { heading, bullet_list, ordered_list, blockquote, code_block } = schema.nodes;
  const { strong, em, code } = schema.marks;

  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, heading, (m) => ({ level: m[1].length })),
      wrappingInputRule(/^\s*([-+*])\s$/, bullet_list),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        ordered_list,
        (m) => ({ order: +m[1] }),
        (m, node) => node.childCount + node.attrs['order'] === +m[1],
      ),
      wrappingInputRule(/^\s*>\s$/, blockquote),
      textblockTypeInputRule(/^`{3}$/, code_block),
      markRule(/\*\*([^*]+)\*\*$/, strong),
      markRule(/(?:^|\s)_([^_\s][^_]*)_$/, em),
      markRule(/`([^`]+)`$/, code),
    ],
  });
};
```

---

## 7. Core: menus plugin (floating + slash)

One plugin handles both menus. It writes through `EditorHooks`, so core code never imports Angular.

Design notes (each fixes a bug in the original plan):

- The floating menu is positioned from the **DOM selection rectangle**, not the average of two `coordsAtPos` values, which is wrong for multi-line selections.
- Positions are recomputed on scroll, resize, focus, and blur.
- Menus are hidden in code blocks, during IME composition, and when the editor loses focus.
- The slash menu supports Escape-to-dismiss that stays dismissed until the `/` is removed.

```ts
// core/menus.plugin.ts
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { EditorHooks } from './editor-hooks';

interface SlashPluginState {
  open: boolean; query: string; from: number; to: number; dismissedAt: number;
}
export const slashKey = new PluginKey<SlashPluginState>('ink-slash');
const CLOSED = { open: false, query: '', from: 0, to: 0 };

function detectSlash(state: EditorState) {
  const { selection } = state;
  const { $from } = selection;
  if (!selection.empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return CLOSED;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const m = /^\/(\w*)$/.exec(before);
  return m ? { open: true, query: m[1], from: $from.start(), to: $from.pos } : CLOSED;
}

export function menusPlugin(hooks: EditorHooks): Plugin<SlashPluginState> {
  return new Plugin<SlashPluginState>({
    key: slashKey,

    state: {
      init: () => ({ ...CLOSED, dismissedAt: -1 }),
      apply(tr, prev, _old, state) {
        const found = detectSlash(state);
        if (!found.open) return { ...CLOSED, dismissedAt: -1 };
        const dismissedAt = tr.getMeta(slashKey)?.dismiss ? found.from : prev.dismissedAt;
        return found.from === dismissedAt
          ? { ...CLOSED, dismissedAt }
          : { ...found, dismissedAt };
      },
    },

    props: {
      // Returning true makes ProseMirror call preventDefault for us.
      handleKeyDown: (_view, event) => !event.isComposing && hooks.onSlashKeyDown(event),
    },

    view(view) {
      let raf = 0;

      const render = () => {
        raf = 0;
        const { state } = view;
        const slash = slashKey.getState(state)!;

        if (slash.open && !view.composing) {
          const c = view.coordsAtPos(slash.to);
          hooks.onSlashMenu({ query: slash.query, from: slash.from, to: slash.to, left: c.left, top: c.bottom });
        } else {
          hooks.onSlashMenu(null);
        }

        const { selection } = state;
        const showFloating =
          !slash.open &&
          selection instanceof TextSelection &&
          !selection.empty &&
          !selection.$from.parent.type.spec.code &&
          view.hasFocus();

        if (showFloating) {
          const domSel = view.dom.ownerDocument.getSelection();
          const rect = domSel && domSel.rangeCount ? domSel.getRangeAt(0).getBoundingClientRect() : null;
          hooks.onFloatingMenu(
            rect && (rect.width || rect.height)
              ? { left: rect.left + rect.width / 2, top: rect.top }
              : null,
          );
        } else {
          hooks.onFloatingMenu(null);
        }
      };

      const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      view.dom.addEventListener('focus', schedule);
      view.dom.addEventListener('blur', schedule);

      return {
        update(v, prev) {
          if (prev.doc.eq(v.state.doc) && prev.selection.eq(v.state.selection)) return;
          render(); // synchronous: DOM is already updated here
        },
        destroy() {
          window.removeEventListener('scroll', schedule, true);
          window.removeEventListener('resize', schedule);
          view.dom.removeEventListener('focus', schedule);
          view.dom.removeEventListener('blur', schedule);
          cancelAnimationFrame(raf);
        },
      };
    },
  });
}
```

---

## 8. Angular layer: service

`EditorService` is provided per `<ink-editor>` instance. It owns the `EditorView`, exposes signals, implements `EditorHooks`, and wraps every command the UI can call.

### 8.1 `editor.service.ts`

```ts
import { ApplicationRef, EnvironmentInjector, Injectable, computed, inject, signal } from '@angular/core';
import { Command, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MarkType } from 'prosemirror-model';
import { setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { redo, redoDepth, undo, undoDepth } from 'prosemirror-history';

import { CalloutKind, schema } from './core/schema';
import { SCHEMA_VERSION, StoredDoc, migrate } from './core/migrations';
import { buildPlugins } from './core/plugins';
import { EditorHooks, FloatingMenuState, SlashMenuState } from './core/editor-hooks';
import { slashKey } from './core/menus.plugin';
import { sanitizeHref } from './core/link-utils';
import { SLASH_ITEMS, SlashItem } from './slash-menu/slash-items';
import { CalloutNodeView } from './node-views/callout.node-view';

export interface BlockInfo {
  type: string;                                  // 'paragraph' | 'heading' | 'code_block' | ...
  level: number | null;                          // heading level
  list: 'bullet_list' | 'ordered_list' | null;   // innermost enclosing list
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
  readonly block = signal<BlockInfo>({ type: 'paragraph', level: null, list: null }, { equal: sameBlock });
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  readonly floatingMenu = signal<FloatingMenuState | null>(null, {
    equal: (a, b) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top),
  });
  readonly slashMenu = signal<SlashMenuState | null>(null, {
    equal: (a, b) => a === b || (!!a && !!b && a.query === b.query && a.from === b.from
      && a.to === b.to && a.left === b.left && a.top === b.top),
  });
  readonly slashActive = signal(0);
  readonly slashItems = computed(() => {
    const q = this.slashMenu()?.query.toLowerCase() ?? '';
    return SLASH_ITEMS.filter(
      (i) => !q || i.label.toLowerCase().includes(q) || i.keywords.some((k) => k.startsWith(q)),
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

  focus(): void { this.view?.focus(); }

  // ── Document IO ──────────────────────────────────────────────────
  getJSON(): StoredDoc {
    return { schemaVersion: SCHEMA_VERSION, doc: this.view!.state.doc.toJSON() };
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

  private createState(stored?: StoredDoc | null, plugins = buildPlugins(this)) {
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

    let list: BlockInfo['list'] = null;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === 'bullet_list' || name === 'ordered_list') { list = name; break; }
    }
    const parent = $from.parent;
    this.block.set({
      type: parent.type.name,
      level: parent.type.name === 'heading' ? (parent.attrs['level'] as number) : null,
      list,
    });

    this.canUndo.set(undoDepth(state) > 0);
    this.canRedo.set(redoDepth(state) > 0);
  }

  // ── EditorHooks (called by the menus plugin) ─────────────────────
  onFloatingMenu(state: FloatingMenuState | null): void { this.floatingMenu.set(state); }

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
    v.dispatch(v.state.tr.delete(menu.from, menu.to));  // remove "/query"
    item.run(this);
    v.focus();
  }

  // ── Commands (called by toolbar and menus) ───────────────────────
  toggleBold()   { this.run(toggleMark(schema.marks['strong'])); }
  toggleItalic() { this.run(toggleMark(schema.marks['em'])); }
  toggleCode()   { this.run(toggleMark(schema.marks['code'])); }
  undo() { this.run(undo); }
  redo() { this.run(redo); }

  paragraph() { this.run(setBlockType(schema.nodes['paragraph'])); }

  /** Toggles: pressing H2 while already in an H2 turns it back into a paragraph. */
  heading(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const b = this.block();
    this.run(
      b.type === 'heading' && b.level === level
        ? setBlockType(schema.nodes['paragraph'])
        : setBlockType(schema.nodes['heading'], { level }),
    );
  }

  toggleList(kind: 'bullet_list' | 'ordered_list') {
    this.run(
      this.block().list === kind
        ? liftListItem(schema.nodes['list_item'])
        : wrapInList(schema.nodes[kind]),
    );
  }

  blockquote() { this.run(wrapIn(schema.nodes['blockquote'])); }
  codeBlock()  { this.run(setBlockType(schema.nodes['code_block'])); }
  insertCallout(kind: CalloutKind = 'info') { this.run(wrapIn(schema.nodes['callout'], { type: kind })); }

  insertDivider() {
    this.run((state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(schema.nodes['horizontal_rule'].create()).scrollIntoView());
      return true;
    });
  }

  insertTable(rows = 3, cols = 3) {
    const { table, table_row, table_cell, table_header } = schema.nodes;
    this.run((state, dispatch) => {
      const body = Array.from({ length: rows }, (_, r) =>
        table_row.create(null, Array.from({ length: cols }, () =>
          (r === 0 ? table_header : table_cell).createAndFill()!)));
      dispatch?.(state.tr.replaceSelectionWith(table.create(null, body)).scrollIntoView());
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
```

### 8.2 `slash-menu/slash-items.ts`

```ts
import type { EditorService } from '../editor.service';

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run(svc: EditorService): void;
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'p',   label: 'Text',          hint: 'Plain paragraph',  keywords: ['paragraph', 'text'], run: (s) => s.paragraph() },
  { id: 'h1',  label: 'Heading 1',     hint: 'Large heading',    keywords: ['h1', 'title'],       run: (s) => s.heading(1) },
  { id: 'h2',  label: 'Heading 2',     hint: 'Medium heading',   keywords: ['h2'],                run: (s) => s.heading(2) },
  { id: 'h3',  label: 'Heading 3',     hint: 'Small heading',    keywords: ['h3'],                run: (s) => s.heading(3) },
  { id: 'ul',  label: 'Bullet list',   hint: 'Unordered list',   keywords: ['ul', 'bullets'],     run: (s) => s.toggleList('bullet_list') },
  { id: 'ol',  label: 'Numbered list', hint: 'Ordered list',     keywords: ['ol', 'numbers'],     run: (s) => s.toggleList('ordered_list') },
  { id: 'q',   label: 'Quote',         hint: 'Blockquote',       keywords: ['blockquote'],        run: (s) => s.blockquote() },
  { id: 'cb',  label: 'Code block',    hint: 'Monospace block',  keywords: ['code', 'pre'],       run: (s) => s.codeBlock() },
  { id: 'cl',  label: 'Callout',       hint: 'Highlighted note', keywords: ['note', 'info'],      run: (s) => s.insertCallout('info') },
  { id: 'tbl', label: 'Table',         hint: '3 × 3 table',      keywords: ['grid'],              run: (s) => s.insertTable(3, 3) },
  { id: 'hr',  label: 'Divider',       hint: 'Horizontal rule',  keywords: ['hr', 'line'],        run: (s) => s.insertDivider() },
];
```

---

## 9. Angular layer: components

### 9.1 `<ink-editor>`: `editor.component.ts`

```ts
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone,
  afterNextRender, effect, inject, input, output, viewChild,
} from '@angular/core';
import { EditorService } from './editor.service';
import { StoredDoc } from './core/migrations';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { FloatingMenuComponent } from './floating-menu/floating-menu.component';
import { SlashMenuComponent } from './slash-menu/slash-menu.component';

@Component({
  selector: 'ink-editor',
  standalone: true,
  imports: [ToolbarComponent, FloatingMenuComponent, SlashMenuComponent],
  providers: [EditorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ink-toolbar />
    <div #host class="ink-host"></div>
    <ink-floating-menu />
    <ink-slash-menu />
  `,
})
export class EditorComponent {
  private readonly svc = inject(EditorService);
  private readonly zone = inject(NgZone);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private timer?: ReturnType<typeof setTimeout>;

  /** Read once at mount. Use loadDoc() to replace the document later. */
  readonly initialDoc = input<StoredDoc | null>(null);
  readonly editable = input(true);
  readonly debounceMs = input(300);
  readonly changed = output<StoredDoc>();

  constructor() {
    // afterNextRender runs only in the browser, so this is SSR-safe.
    afterNextRender(() => {
      this.svc.mount(this.host().nativeElement, {
        doc: this.initialDoc(),
        editable: this.editable(),
        onChange: () => this.scheduleEmit(),
      });
    });

    effect(() => this.svc.setEditable(this.editable()));

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.svc.destroy();
    });
  }

  // ── Public API ─────────────────────────────────────────────────
  loadDoc(doc: StoredDoc) { this.svc.setDoc(doc); }
  focus() { this.svc.focus(); }
  /** Emit pending changes immediately (call before navigating away). */
  flush() {
    clearTimeout(this.timer);
    this.changed.emit(this.svc.getJSON());
  }

  private scheduleEmit() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.zone.run(() => this.changed.emit(this.svc.getJSON())),
      this.debounceMs(),
    );
  }
}
```

**Usage:**

```html
<ink-editor
  [initialDoc]="doc"
  [editable]="!readOnly()"
  (changed)="save($event)" />
```

| Member | Type | Description |
| --- | --- | --- |
| `initialDoc` | input `StoredDoc \| null` | Document loaded at mount |
| `editable` | input `boolean` | Toggles read-only mode |
| `debounceMs` | input `number` | Debounce for `changed` (default 300) |
| `changed` | output `StoredDoc` | Debounced `{ schemaVersion, doc }` envelope |
| `loadDoc()` | method | Replace the document |
| `flush()` | method | Emit immediately |

### 9.2 Toolbar: `toolbar/toolbar.component.ts`

Buttons use **`mousedown` + `preventDefault`** to keep the editor's selection, and **`click`** to perform the action. Keyboard users activate buttons via `click` (Enter/Space), so putting the action on `mousedown` alone would make the toolbar unusable without a mouse.

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-toolbar" role="toolbar" aria-label="Text formatting" (mousedown)="$event.preventDefault()">
      <button type="button" aria-label="Bold" [attr.aria-pressed]="svc.isBold()"
              [class.active]="svc.isBold()" (click)="svc.toggleBold()">B</button>
      <button type="button" aria-label="Italic" [attr.aria-pressed]="svc.isItalic()"
              [class.active]="svc.isItalic()" (click)="svc.toggleItalic()">I</button>
      <button type="button" aria-label="Inline code" [attr.aria-pressed]="svc.isCode()"
              [class.active]="svc.isCode()" (click)="svc.toggleCode()">&lt;/&gt;</button>

      <button type="button" aria-label="Heading 1" [attr.aria-pressed]="svc.block().level === 1"
              [class.active]="svc.block().level === 1" (click)="svc.heading(1)">H1</button>
      <button type="button" aria-label="Heading 2" [attr.aria-pressed]="svc.block().level === 2"
              [class.active]="svc.block().level === 2" (click)="svc.heading(2)">H2</button>

      <button type="button" aria-label="Bullet list" [attr.aria-pressed]="svc.block().list === 'bullet_list'"
              [class.active]="svc.block().list === 'bullet_list'" (click)="svc.toggleList('bullet_list')">•</button>
      <button type="button" aria-label="Numbered list" [attr.aria-pressed]="svc.block().list === 'ordered_list'"
              [class.active]="svc.block().list === 'ordered_list'" (click)="svc.toggleList('ordered_list')">1.</button>

      <button type="button" aria-label="Undo" [disabled]="!svc.canUndo()" (click)="svc.undo()">↶</button>
      <button type="button" aria-label="Redo" [disabled]="!svc.canRedo()" (click)="svc.redo()">↷</button>
    </div>
  `,
})
export class ToolbarComponent {
  protected readonly svc = inject(EditorService);
}
```

`EditorService` is available here because `<ink-editor>` lists it in `providers`, and component providers are visible to child components in its template.

### 9.3 Floating menu: `floating-menu/floating-menu.component.ts`

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-floating-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.floatingMenu(); as m) {
      <div class="ink-floating" role="toolbar" aria-label="Selection formatting"
           [style.left.px]="m.left" [style.top.px]="m.top"
           (mousedown)="$event.preventDefault()">
        <button type="button" aria-label="Bold" [attr.aria-pressed]="svc.isBold()" (click)="svc.toggleBold()">B</button>
        <button type="button" aria-label="Italic" [attr.aria-pressed]="svc.isItalic()" (click)="svc.toggleItalic()">I</button>
        <button type="button" aria-label="Inline code" [attr.aria-pressed]="svc.isCode()" (click)="svc.toggleCode()">&lt;/&gt;</button>
      </div>
    }
  `,
})
export class FloatingMenuComponent {
  protected readonly svc = inject(EditorService);
}
```

### 9.4 Slash menu: `slash-menu/slash-menu.component.ts`

Keyboard handling (Arrow keys, Enter, Tab, Escape) lives in the plugin → service path, not in this component, because focus must stay in the editor.

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorService } from '../editor.service';

@Component({
  selector: 'ink-slash-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.slashMenu(); as m) {
      <ul class="ink-slash" role="listbox" aria-label="Insert block"
          [style.left.px]="m.left" [style.top.px]="m.top"
          (mousedown)="$event.preventDefault()">
        @for (item of svc.slashItems(); track item.id; let i = $index) {
          <li role="option" [attr.aria-selected]="i === svc.slashActive()"
              [class.active]="i === svc.slashActive()" (click)="svc.runSlashItem(item)">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </li>
        } @empty {
          <li aria-disabled="true">No matches</li>
        }
      </ul>
    }
  `,
})
export class SlashMenuComponent {
  protected readonly svc = inject(EditorService);
}
```

---

## 10. Angular components inside NodeViews

Use a `NodeView` when a block needs interactive UI that plain `toDOM` cannot express. The example is a callout whose icon button (an Angular component) switches the callout type.

A NodeView that hosts Angular components has four obligations:

1. **Create** the component with `createComponent` using the app's `EnvironmentInjector` and `ApplicationRef`.
2. **Tell ProseMirror what is editable:** `contentDOM` is the editable area; `ignoreMutation` and `stopEvent` keep ProseMirror from reacting to the Angular-rendered parts.
3. **Keep it in sync:** implement `update()` so ProseMirror reuses the view instead of recreating it.
4. **Destroy** the component in `destroy()`, or it leaks.

Because the editor runs outside the zone, use **signal inputs + `OnPush`**; change detection is then scheduled automatically when inputs change (Angular 18+).

### 10.1 `node-views/callout-icon.component.ts`

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CALLOUT_KINDS, CalloutKind } from '../core/schema';

const ICONS: Record<CalloutKind, string> = { info: 'ℹ️', warning: '⚠️', success: '✅', danger: '⛔' };

@Component({
  selector: 'ink-callout-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="callout-icon" aria-label="Change callout type"
            (mousedown)="$event.preventDefault()" (click)="next()">{{ icon() }}</button>
  `,
})
export class CalloutIconComponent {
  readonly kind = input<CalloutKind>('info');
  readonly kindChange = output<CalloutKind>();
  protected readonly icon = computed(() => ICONS[this.kind()]);

  protected next() {
    const i = CALLOUT_KINDS.indexOf(this.kind());
    this.kindChange.emit(CALLOUT_KINDS[(i + 1) % CALLOUT_KINDS.length]);
  }
}
```

### 10.2 `node-views/callout.node-view.ts`

```ts
import { ApplicationRef, ComponentRef, EnvironmentInjector, createComponent } from '@angular/core';
import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import { CalloutIconComponent } from './callout-icon.component';

export class CalloutNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly iconHost: HTMLElement;
  private readonly ref: ComponentRef<CalloutIconComponent>;

  constructor(
    private node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    env: EnvironmentInjector,
    appRef: ApplicationRef,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = `callout callout-${node.attrs['type']}`;
    this.dom.dataset['callout'] = node.attrs['type'];

    this.iconHost = document.createElement('span');
    this.iconHost.contentEditable = 'false';

    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'callout-body';

    this.dom.append(this.iconHost, this.contentDOM);

    this.ref = createComponent(CalloutIconComponent, {
      environmentInjector: env,
      hostElement: this.iconHost,
    });
    this.ref.setInput('kind', node.attrs['type']);
    this.ref.instance.kindChange.subscribe((kind) => {
      const pos = getPos();
      if (pos == null) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'type', kind));
    });
    appRef.attachView(this.ref.hostView);   // enables change detection for the component
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;   // different node: recreate
    this.node = node;
    this.dom.className = `callout callout-${node.attrs['type']}`;
    this.dom.dataset['callout'] = node.attrs['type'];
    this.ref.setInput('kind', node.attrs['type']);
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.iconHost.contains(event.target as Node);   // clicks on the icon are Angular's
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);     // only the content area is ProseMirror's
  }

  destroy(): void {
    this.ref.destroy();
  }
}
```

---

## 11. Storage, import/export, security

### 11.1 Storage

- **Source of truth:** the `StoredDoc` envelope (`{ schemaVersion, doc }`) as JSON (e.g. a `jsonb` column).
- **Never** store HTML or Markdown as the primary format; generate them for export only.
- Always load through `migrate()` (done inside `EditorService.createState`).

### 11.2 `io/html.ts`: sanitized import/export

```ts
import DOMPurify from 'dompurify';
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from 'prosemirror-model';
import { schema } from '../core/schema';

export function docToHtml(doc: PMNode): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

export function htmlToDoc(html: string): PMNode {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  const el = document.createElement('div');
  el.innerHTML = clean;
  return PMDOMParser.fromSchema(schema).parse(el);
}
```

### 11.3 Security model

| Threat | Defense |
| --- | --- |
| Pasted HTML with scripts or event handlers | ProseMirror's `DOMParser` keeps only schema-allowed nodes and marks. Add `transformPastedHTML` with DOMPurify as defense in depth |
| `javascript:` links | `sanitizeHref` allow-list in the `link` mark's `parseDOM`, `toDOM`, and `setLink()` |
| Stored content rendered elsewhere via `innerHTML` | Render from `doc` via `DOMSerializer`, or sanitize with DOMPurify. Angular's `[innerHTML]` sanitizes by default; never use `bypassSecurityTrustHtml` on editor output |
| Tab-nabbing | Links always get `rel="noopener noreferrer nofollow"` |
| Uploaded images | Validate type and size client-side *and* server-side; store as URLs, not data URIs |

---

## 12. Accessibility

| Area | Requirement | Where implemented |
| --- | --- | --- |
| Editor role | `role="textbox"`, `aria-multiline="true"`, `aria-label` | `EditorView` `attributes` prop |
| Toolbar | `role="toolbar"`, labelled; buttons have `aria-label` and `aria-pressed` for toggles | Toolbar component |
| Keyboard | Every toolbar action reachable and activatable by keyboard (`click`, not `mousedown`) | Toolbar component |
| Slash menu | `role="listbox"` / `role="option"` with `aria-selected`; Arrow/Enter/Tab/Escape handled | Slash component + `onSlashKeyDown` |
| Focus | Menus never take focus from the editor (`mousedown` + `preventDefault`) | All menu components |
| Shortcuts | Document shortcuts (Mod-B, Mod-I, Mod-E, Mod-Z) in help/tooltips | Product UI |

**Still to do (Phase 9):** wire `aria-activedescendant` on the editor to the active slash item and give options stable `id`s, so screen readers announce the highlighted option while focus stays in the text.

---

## 13. Collaboration (Yjs)

**Decide in Phase 0, even if you build it in Phase 7.** Yjs changes three things in this design:

1. **Initial state** comes from a `Y.Doc` via `ySyncPlugin`, not from `nodeFromJSON`.
2. **Undo/redo** must use `yUndoPlugin` instead of `prosemirror-history`. The `undo`, `redo`, `undoDepth`, and `redoDepth` calls in `EditorService` are history-specific.
3. **Persistence** moves to the Yjs update stream (via a provider such as `y-websocket` or Hocuspocus); the JSON envelope becomes a snapshot/export format.

To keep the swap cheap, isolate undo behind one seam in the service:

```ts
// with prosemirror-history (today)
this.canUndo.set(undoDepth(state) > 0);

// with y-prosemirror (later)
import { yUndoPluginKey } from 'y-prosemirror';
this.canUndo.set((yUndoPluginKey.getState(state)?.undoManager.undoStack.length ?? 0) > 0);
```

Plugin set for collab: replace `history()` with `ySyncPlugin(fragment)`, `yUndoPlugin()`, and optionally `yCursorPlugin(awareness)`; bind `Mod-z`/`Mod-y` to `undo`/`redo` exported from `y-prosemirror`.

---

## 14. Testing

### 14.1 Unit tests (no DOM, no Angular)

Commands, input rules, and migrations are pure functions of editor state.

```ts
import { builders } from 'prosemirror-test-builder';
import { EditorState, TextSelection } from 'prosemirror-state';
import { splitListItem } from 'prosemirror-schema-list';
import { schema } from './core/schema';

const { doc, p, ul, li } = builders(schema, {
  p: { nodeType: 'paragraph' },
  ul: { nodeType: 'bullet_list' },
  li: { nodeType: 'list_item' },
});

it('Enter in a list creates a new list item', () => {
  const d = doc(ul(li(p('one<a>'))));
  let state = EditorState.create({ doc: d, selection: TextSelection.create(d, (d as any).tag.a) });

  const ran = splitListItem(schema.nodes['list_item'])(state, (tr) => (state = state.apply(tr)));

  expect(ran).toBe(true);
  expect(state.doc.firstChild!.childCount).toBe(2);   // two <li>
});
```

### 14.2 Test matrix

| Layer | What | Tool |
| --- | --- | --- |
| Schema | `toJSON`/`nodeFromJSON` round trip; `toDOM`/`parseDOM` round trip; unsafe `href` is dropped | Jest / Vitest |
| Migrations | One fixture per old version loads and migrates | Jest / Vitest |
| Commands & rules | Lists, headings, marks, input rules (including `Backspace` undoing a rule) | Jest / Vitest + test-builder |
| Service | Signals reflect state: bold, block level, list, undo availability | Angular TestBed |
| E2E | Typing, shortcuts, paste, slash menu (keyboard and mouse), floating menu on multi-line selection, IME input, tables, read-only | Playwright |
| Accessibility | Axe scan on toolbar and menus; keyboard-only run-through | Playwright + axe-core |

---

## 15. Roadmap

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| **0** | **Foundations and decisions:** name, schema v1, storage envelope + `migrate()`, collaboration yes/no, SSR yes/no, supported browsers, a11y target | Decisions recorded in section 16 |
| **1** | Schema, mount, basic marks, headings, lists (Enter/Tab work), undo/redo | Typing loop works; unit tests for list commands pass |
| **2** | Toolbar with active states, keyboard shortcuts, input rules (including mark rules, Backspace undo) | Usable editor; toolbar fully keyboard-operable |
| **3** | Links (dialog + safe protocols), images (upload), code block, hard break | Link XSS test passes; image upload validated |
| **4** | Floating menu, slash menu | Menus correct on multi-line selection, scroll, IME |
| **5** | Tables (with `tables.css`, Tab navigation), block drag handles | Table keyboard navigation works |
| **6** | Mentions, custom blocks (callout NodeView, panel) | NodeViews destroy cleanly (no leaks) |
| **7** | Collaboration (Yjs), comments | Two clients converge; undo only affects own edits |
| **8** | Import/export (sanitized HTML, Markdown), read-only mode polish | Round-trip tests; sanitization tests |
| **9** | Hardening: `aria-activedescendant`, performance profiling, large-doc test, docs | Meets N1-N5 |

---

## 16. Risks and open decisions

| # | Item | Options | Decision (fill in) |
| --- | --- | --- | --- |
| D1 | Product name and npm scope | Inkframe / other | |
| D2 | Collaboration | Yes (Yjs) / No | |
| D3 | SSR | Yes / No | |
| D4 | Minimum Angular version | 18 / 19 / 20 | |
| D5 | Image storage | Own backend / S3-style / third party | |
| D6 | Markdown support | Export only / import and export | |
| D7 | UI library | Plain CSS / PrimeNG / Angular Material | |

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Schema changes break saved documents | High | Versioned envelope + migrations + fixtures (section 5.3) |
| Collaboration retrofitted late | High | Decide in Phase 0; isolate undo seam (section 13) |
| NodeView memory leaks | Medium | `destroy()` always calls `ref.destroy()`; leak test in Phase 6 |
| Large-document performance | Medium | Debounced serialization; avoid per-keystroke `toJSON`; profile in Phase 9 |
| IME / mobile quirks | Medium | Guard menus with `view.composing` / `isComposing`; Playwright IME tests |
| ProseMirror major-version changes | Low | Pin versions; read changelogs before upgrading |

---

## 17. Pitfalls checklist

- [ ] The `EditorView` is created outside the zone and no `zone.run` happens per transaction.
- [ ] Signals have equality comparators; `blockType` info is a small struct, not a fresh object per keystroke.
- [ ] Document JSON is serialized only on a debounce or on demand.
- [ ] Toolbar buttons use `mousedown` + `preventDefault` **and** `click` for the action.
- [ ] `Enter: splitListItem` is bound before `baseKeymap`.
- [ ] `tables.css` and `gapcursor.css` are loaded.
- [ ] External updates replace the state (`setDoc`), never mutate the DOM.
- [ ] Every schema change bumps `SCHEMA_VERSION` and adds a migration.
- [ ] Link `href`s go through `sanitizeHref` everywhere.
- [ ] Menus are suppressed during IME composition and in code blocks.
- [ ] NodeViews destroy their Angular components.
- [ ] Collaboration decision recorded before building many features.

---

## 18. Changelog: what was fixed from the original plan

| # | Original | Fix in this document |
| --- | --- | --- |
| 1 | `addListNodes(basicNodes as any, …)` would throw (needs `OrderedMap`) | Build a base `Schema` and pass `spec.nodes` (5.2) |
| 2 | `<app-toolbar />` not imported | `imports: [...]` on the component (9.1) |
| 3 | `prosemirror-schema-basic` missing from install list | Added to `npm i` (3.1) |
| 4 | Mounting in `ngAfterViewInit` breaks SSR | `afterNextRender` (9.1) |
| 5 | Only `prosemirror.css` loaded | Also `gapcursor.css` and `tables.css` (3.2) |
| 6 | Enter in a list did not create a new bullet | `Enter: splitListItem`, plus Tab/Shift-Tab (6.2) |
| 7 | Toolbar action on `mousedown` excluded keyboard users | `mousedown` prevents default; action on `click` (9.2) |
| 8 | `effect()` emitted `changed`, tracking the parent handler's reads | Direct debounced callback, no effect (9.1) |
| 9 | `zone.run` on every transaction cancelled the zone-free design | Signals written directly; zone used only for the debounced emit (2.1, 9.1) |
| 10 | Full `toJSON()` on every keystroke | Serialize on debounce/on demand via `getJSON()` (8.1, 9.1) |
| 11 | `blockType` was a bare node name (lists/levels invisible) | `BlockInfo { type, level, list }` with equality (8.1) |
| 12 | Floating menu used the average of two coords, no scroll handling | DOM selection rect + scroll/resize/focus handlers (7) |
| 13 | No `Backspace: undoInputRule` | Added (6.2) |
| 14 | Ordered-list rule ignored the start number | `order` attr and join predicate (6.3) |
| 15 | Plugins had no way to reach Angular | `EditorHooks` contract; `buildPlugins(hooks)` (6.1, 6.2) |
| 16 | Yjs would conflict with history-based undo | Isolated undo seam; swap guide (13) |
| 17 | Sanitization advice aimed at the wrong place; `javascript:` links allowed | Link allow-list; DOMPurify on import; `rel` on links (5.1, 11) |
| 18 | NodeView guidance omitted lifecycle | Full Angular NodeView with `update`, `stopEvent`, `ignoreMutation`, `destroy` (10) |
| 19 | IME composition not handled | `view.composing` and `event.isComposing` guards (7) |
| 20 | Missing basics (hard break, read-only, external doc replace, mark input rules) | Added `Shift-Enter`, `setEditable`, `setDoc`/`loadDoc`, mark rules (6, 8, 9) |
| 21 | Collaboration decision was in Phase 7 only | Moved to Phase 0 (15) |

---

## 19. Resources

- ProseMirror Guide: https://prosemirror.net/docs/guide/
- ProseMirror Reference: https://prosemirror.net/docs/ref/
- ProseMirror examples: https://prosemirror.net/examples/
- Tiptap source (MIT), a good reference for extension and command patterns: https://github.com/ueberdosis/tiptap
- Yjs + ProseMirror: https://github.com/yjs/y-prosemirror
- DOMPurify: https://github.com/cure53/DOMPurify
- Angular signals: https://angular.dev/guide/signals
