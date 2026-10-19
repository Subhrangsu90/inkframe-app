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
| `showRuler` | `boolean` | `true` | Shows the ruler above the page, with handles for the left and right margins. Only while editing, and only from 768px up. |
| `zoom` | `PageZoom` | `'auto'` | How big a Pages sheet is shown: `'fit'` (the editor's width), a scale from `0.25` to `2`, or `'auto'` (100%, or fitted when the sheet is wider than the editor). The status bar changes it; bind it two-way, `[(zoom)]`, to keep it. Not saved in the document. |
| `mobileToolbar` | `'top' \| 'bottom'` | `'top'` | Where the toolbar goes on screens narrower than 768px. `'bottom'` keeps it within thumb reach. |
| `defaultPageSetup` | `PageSetup \| null` | `null` | The page setup for new documents; bind it two-way, `[(defaultPageSetup)]`, to keep it. A document without page setup opens the Page setup dialog with these values, and the dialog's "Set as default" replaces it. `null` means Pageless, with Letter paper in the US and Canada and A4 elsewhere. See [Page setup](#page-setup). |

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
| `openPageSetup(section?)` | Opens the Page setup dialog (when the editor is editable), at its top or, with `'header'` or `'footer'`, at that field. The status bar opens it too, and so does double-clicking a page's top or bottom margin. |
| `getPageStarts(): number[] \| null` | Where page view starts each page after the first, as positions in `getJSON()`'s document (empty for one page); null when page view is off. Pass them to `docToHtmlDocument()` (`pageStarts`) to print the pages shown, with their headers, footers and page numbers. See [Page setup](#page-setup). |

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

### Page setup

Each document has a layout: **Pageless** (the default) or **Pages**, with a paper size (A4, Letter, Legal, A3 or A5), an orientation, margins, and an optional header, footer and page numbers. Users change it in the Page setup dialog, which opens from the status bar (on screens with a mouse) or with `openPageSetup()`. Each change is one undo step.

The setup is stored in the document, as the `page` attribute of the `doc` node, so it travels wherever the `StoredDoc` goes. Read it with `pageSetupOf(doc)`, or `EditorService.pageSetup()` in the editor; values from untrusted documents are checked by `normalizePageSetup()`.

- **On screen:** Pageless fills the editor, with side margins of 10% of its width (at least 32px). Pages shows the document as separate pages, each the size of the paper, with the page margins and "Page 2 of 5" in the gap below; the editor scrolls sideways when the pages are wider. Under 768px both are one full-width sheet with 16px margins.
- **Page view** splits Pages documents the way printing does: paragraph lines move to the next page with at least two lines on each side, headings stay with what follows, table rows split between rows, and code blocks, quotes, callouts and list items stay whole when they fit a page. Page breaks start a new page. It changes nothing in the document: what moves to the next page is pushed down by spacers on screen, laid out again shortly after each edit.
- **Ruler:** above the page, a handle on each side margin. Dragging previews the margin and releasing applies it (one undo step). Each handle is a slider for the keyboard: Left and Right move it the way it looks, Up and Down change the margin's size, Shift takes bigger steps (Pages: 1 mm and 1 cm, or 1/16 and 1/4 inch on Letter and Legal; Pageless: 1% and 5% of the width).
- **Showing a document outside the editor** (a reader page, a preview): give the scrolling element the class `ink-canvas`, `data-ink-layout` set to the layout and the custom properties from `pageLayoutStyle(setup)`; put the page in an `ink-sheet` element and the content in an `ink-sheet-body` element. The editor's stylesheet lays them out as the editor does. For page view there too, add the `inkPageView` directive and `<ink-page-frames>` from `@inkframe-ui/editor/ui`:

  ```html
  <div class="ink-canvas" [attr.data-ink-layout]="setup.layout"
       [attr.data-ink-page-view]="pages() ? '' : null"
       [style]="{ ...pageLayoutStyle(setup), ...pageViewStyle(pages()) }">
    <article class="ink-sheet">
      @if (pages()) { <ink-page-frames [pages]="pages()" [setup]="setup" /> }
      <div class="ink-sheet-body ink-static-doc ProseMirror" [innerHTML]="html"
           [inkPageView]="setup" (pageCount)="pages.set($event)"></div>
    </article>
  </div>
  ```

  To print those pages, pass the directive's `pageStarts(doc)` (positions in the document the HTML shows; null when page view is off) to `docToHtmlDocument()` as `pageStarts`. Without Angular, `StaticPageView` does the same for any element holding `docToHtml()` output, and `pageStartsInHtml(element, doc)` gives its page starts. Its spacers are `.ink-page-spacer` elements, so a page printing itself can also give them `break-before: page`.
- **Header, footer and page numbers** (Pages layout): a line of plain text in each page's top margin and one in its bottom margin, each on the left, in the center or on the right, and page numbers ("3" or "Page 3 of 12") at the top or bottom of each page. They can be left off the first page, which still counts. Page view draws them on screen, and they print with the pages (see Printing). `pageMarginLines(setup, page, pages)` gives what a page shows. Header and footer text from untrusted documents is kept to one line of at most 200 characters, without control or bidirectional override characters.
- **Zoom:** Pages layout can be shown at Fit width or 50–200% (the status bar, on screens with a mouse, from 768px up), with CSS `zoom` on the sheet. Everything drawn on the page follows it: the caret, selection, menus, the ruler, list and table handles, image and column resizing. Printing is not zoomed.
- **Page color:** one of `PAGE_COLORS` (stored by name), each with a light and a dark value that keep WCAG AA contrast for the editor's text. It colors the sheet (Pages) or the whole canvas (Pageless). Printouts stay on white paper unless the document's "Print page color" is on; then the color covers the whole sheet, margins included. Exports use the light value.
- **Page breaks:** a `page_break` block at the top level of a document, inserted with `Mod-Enter` (at the cursor in a paragraph or heading, after the list, table or callout elsewhere; task lists keep `Mod-Enter` for checking tasks, code blocks for leaving the block) or "Page break" in the slash menu. Printing starts a new page there. HTML writes it as `<div class="ink-page-break">`, and so does Markdown, which reads that line back.
- **Printing:** `docToHtmlDocument()` writes the paper size and margins as `@page` rules for Pages documents, so the print dialog starts on the right paper. For a printout whose lines break where they do on screen, pass `fontFaceCss` (your `@font-face` rules for Inter and JetBrains Mono), `editorFontSize` and, if your page sets one, `editorLetterSpacing`. For the pages shown in the editor, pass `pageStarts: editor.getPageStarts()` with `getJSON()`'s document: the printout then draws each page itself, a box the size of the paper with the page's part of the document (split there by `withPageStarts()`, even inside a paragraph, list or table), its header, footer and number. That works in every browser, and numbers the pages as the screen does. Without page starts (null, as on phones, where page view is off), the printer splits pages itself, by the same rules but without the room the editor's controls take around tables and code, so pages can end in different places; the header, footer and numbers then print as `@page` margin boxes, which only Chrome supports.
- **Markdown** has no page setup: `docToMarkdown()` leaves it out, and imported Markdown is Pageless.
- **HTML import** does not read it back from an exported page.

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
| `@inkframe-ui/editor/ui` | The editor's menus and panels: floating menu, slash menu, table toolbar, find and replace, image lightbox, status bar, Page setup dialog, ruler, page view for documents shown outside the editor (`inkPageView`, `<ink-page-frames>`) |
| `@inkframe-ui/editor/styles` | The editor stylesheet (Sass) |

Most apps only need `<ink-editor>`. The other entry points are for building your own editor layout around `EditorService`.

## License

[MIT](./LICENSE)
