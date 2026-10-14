# @inkframe-ui/editor

A WYSIWYG document editor for Angular, built on [ProseMirror](https://prosemirror.net). It comes with the full UI: a toolbar, a floating format bar, a slash menu, table controls, find and replace, and a word count. You can turn features on and off, or add your own, through extensions.

It is the editor behind the [Inkframe](https://github.com/Subhrangsu90/inkframe-app) app.

> **Pre-1.0.** The API may still change between minor versions.

## Features

- Headings, bold, italic, underline, strikethrough, inline code, subscript, superscript, small text, text color and highlight
- Text alignment, block quotes, dividers and callouts (info, note, warning, success, danger)
- Bullet, numbered and task lists, with nesting, drag to reorder and custom list styles
- Tables with row and column handles, header rows, cell alignment and cell colors
- Code blocks with syntax highlighting, a language picker, line wrap and copy
- Images, stored in the browser's IndexedDB
- Links, with unsafe protocols blocked
- Markdown shortcuts (`#`, `-`, `1.`, `[ ]`, `>`, `` ``` ``…) and a `/` slash menu
- Markdown and HTML import and export, with sanitized HTML
- Paste cleanup for content from Word and Google Docs
- Dark and light themes through CSS custom properties
- Safe with server-side rendering: the editor mounts only in the browser

## Install

```bash
npm install @inkframe-ui/editor @angular/material @angular/cdk
```

Peer dependencies: Angular 22 (`@angular/core`, `@angular/common`, `@angular/forms`), `@angular/material` and `@angular/cdk`. The toolbar menus and tooltips are Angular Material components, so your app needs a Material theme (`mat.theme()`).

## Setup

### 1. Styles

Add the ProseMirror base styles and the editor's icon font to the `styles` array in `angular.json`:

```json
"styles": [
  "node_modules/prosemirror-view/style/prosemirror.css",
  "node_modules/prosemirror-gapcursor/style/gapcursor.css",
  "node_modules/prosemirror-tables/style/tables.css",
  "node_modules/@inkframe-ui/editor/styles/fonts/icons.css",
  "src/styles.scss"
]
```

Then load the editor styles in your global stylesheet:

```scss
// src/styles.scss
@use '@inkframe-ui/editor/styles';
```

Code blocks use JetBrains Mono when it is loaded (for example from `@fontsource-variable/jetbrains-mono`) and fall back to the system monospace font.

### 2. Icons

The editor uses a self-hosted subset of Material Symbols Outlined. Tell `mat-icon` to use it:

```ts
// app.config.ts
import { inject, provideAppInitializer } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass(
        'material-symbols-outlined',
        'mat-ligature-font',
      );
    }),
  ],
};
```

The subset contains only the icons the editor uses. If your own extensions use other icon names, load the full Material Symbols font, or your own subset, as well.

## Usage

```ts
import { Component, viewChild } from '@angular/core';
import { Editor } from '@inkframe-ui/editor';
import type { StoredDoc } from '@inkframe-ui/editor/core';

@Component({
  selector: 'app-page',
  imports: [Editor],
  template: `
    <ink-editor #editor [initialDoc]="doc" (changed)="save($event)" />
  `,
})
export class Page {
  private readonly editor = viewChild.required<Editor>('editor');
  doc: StoredDoc | null = loadFromYourStorage();

  save(doc: StoredDoc) {
    saveToYourStorage(doc);
  }

  exportMarkdown() {
    return this.editor().getMarkdown();
  }
}
```

### Inputs

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `initialDoc` | `StoredDoc \| null` | `null` | The document to open. Read once, when the editor mounts; use `loadDoc()` to replace it later. |
| `editable` | `boolean` | `true` | `false` shows the document read-only, without toolbar or menus. |
| `extensions` | `EditorExtension[]` | `DEFAULT_EXTENSIONS` | The features to enable. See [Extensions](#extensions). |
| `debounceMs` | `number` | `300` | How long to wait after the last edit before emitting `changed`. |
| `showToolbar` | `boolean` | `true` | Shows the toolbar. |
| `showStatusBar` | `boolean` | `true` | Shows words, characters and reading time below the document. |
| `mobileToolbar` | `'top' \| 'bottom'` | `'top'` | Where the toolbar goes on screens narrower than 768px. `'bottom'` keeps it within thumb reach. |

### Outputs

| Output | Payload | Description |
| --- | --- | --- |
| `changed` | `StoredDoc` | The document after edits, debounced by `debounceMs`. |
| `historyRequested` | `void` | The user asked to open version history (the toolbar's history button). |

### Methods

| Method | Description |
| --- | --- |
| `loadDoc(doc: StoredDoc)` | Replaces the document. Pending changes to the previous one are emitted first. |
| `getJSON(): StoredDoc` | The current document. |
| `getMarkdown(): string` / `loadMarkdown(md)` | Markdown export and import. |
| `getHtml(): string` / `loadHtml(html)` | HTML export and import. Imported HTML is sanitized. |
| `flush()` | Emits pending (debounced) changes now. |
| `focus()` / `blur()` | Moves focus into the document, or closes the editor's menus. |

### Saving: call `flush()` before the editor is destroyed

`changed` is debounced, and it cannot fire while the editor is being destroyed, because Angular has already removed your listener by then. Call `flush()` before the editor goes away. Otherwise the last edits are lost. With the router, a `canDeactivate` guard does it:

```ts
{
  path: 'doc/:id',
  loadComponent: () => import('./doc-page').then((m) => m.DocPage),
  canDeactivate: [(page: DocPage) => (page.editor().flush(), true)],
}
```

The editor already flushes when the tab is hidden or closed.

### The document format

`changed` and `getJSON()` return a `StoredDoc`:

```ts
interface StoredDoc {
  schemaVersion: number; // SCHEMA_VERSION when the document was saved
  doc: unknown; // ProseMirror JSON
}
```

Save it as it is. When the schema changes in a later version, the editor migrates older documents when it opens them.

## Extensions

Each feature is an extension. `DEFAULT_EXTENSIONS` (also exported as `StarterKit`) enables everything. To enable less, pass your own list. The document, paragraph, text and line break nodes are always included.

```ts
import {
  HistoryExtension,
  HeadingExtension,
  BoldExtension,
  ItalicExtension,
  BulletListExtension,
  CodeBlockExtension,
} from '@inkframe-ui/editor/core';

readonly extensions = [
  HistoryExtension,
  HeadingExtension,
  BoldExtension,
  ItalicExtension,
  BulletListExtension,
  CodeBlockExtension,
];
```

```html
<ink-editor [extensions]="extensions" />
```

The toolbar, floating bar and slash menu show only the tools of the enabled extensions.

### Writing an extension

An extension can add schema nodes and marks, input rules, keyboard shortcuts, ProseMirror plugins and node views. It can also add buttons to the toolbar and the floating bar, and commands to the slash menu. Its toolbar buttons appear in a section after the built-in tools; leave their `group` unset, or set it to `'custom'`.

```ts
import { createExtension, DEFAULT_EXTENSIONS } from '@inkframe-ui/editor/core';

const Signature = createExtension({
  name: 'signature',
  toolbarItems: [
    {
      id: 'signature',
      icon: 'notes',
      tooltip: 'Insert signature',
      run: (svc) => svc.insertText('— Sent from my editor'),
    },
  ],
  slashItems: [
    {
      id: 'signature',
      label: 'Signature',
      hint: 'Insert your signature',
      icon: 'notes',
      keywords: ['sign', 'signature'],
      run: (svc) => svc.insertText('— Sent from my editor'),
    },
  ],
  keymaps: () => ({
    'Mod-Alt-s': (state, dispatch) => {
      dispatch?.(state.tr.insertText('— Sent from my editor'));
      return true;
    },
  }),
});

readonly extensions = [...DEFAULT_EXTENSIONS, Signature];
```

`EditorExtension` in `@inkframe-ui/editor/core` lists every field.

## Converting documents without an editor

`@inkframe-ui/editor/core` has the converters the editor uses:

```ts
import {
  migrate,
  schema,
  docToMarkdown,
  markdownToDoc,
  docToHtml,
  htmlToDoc,
  docToHtmlDocument,
  type StoredDoc,
} from '@inkframe-ui/editor/core';

const stored: StoredDoc = loadFromYourStorage();
const doc = schema.nodeFromJSON(migrate(stored));
const markdown = docToMarkdown(doc);
const page = docToHtmlDocument(doc, { title: 'My document' }); // a standalone HTML page
```

## Theming

The editor is dark by default. For the light theme, set `data-theme="light"` on `<html>`, or use `ThemeService`, which also remembers the choice:

```ts
import { inject } from '@angular/core';
import { ThemeService } from '@inkframe-ui/editor/core';

inject(ThemeService).setTheme('light');
```

Colors, spacing and the document font size are CSS custom properties prefixed `--ink-` (for example `--ink-editor-font-size`). Override them in your own stylesheet.

## Entry points

| Import from | Contents |
| --- | --- |
| `@inkframe-ui/editor` | `Editor` (`<ink-editor>`) |
| `@inkframe-ui/editor/core` | `EditorService`, the schema, extensions, converters, `ThemeService` and types |
| `@inkframe-ui/editor/toolbar` | `Toolbar` (`<ink-toolbar>`) |
| `@inkframe-ui/editor/ui` | The editor's menus and panels: floating menu, slash menu, table toolbar, find and replace, image lightbox, status bar |
| `@inkframe-ui/editor/styles` | The editor stylesheet (Sass) |

Most apps only need `<ink-editor>`. The other entry points are for building your own editor layout around `EditorService`.

## License

[MIT](./LICENSE)
