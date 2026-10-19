# Inkframe Product Plan

| | |
| --- | --- |
| **Product** | Inkframe: a private, full WYSIWYG document editor that runs entirely on your device |
| **Deliverables** | The web app (`inkframe-app`) and the embeddable Angular editor library (`@inkframe-ui/editor`) |
| **Stack** | Angular 22 (standalone components, signals, SSR), ProseMirror, Angular Material (M3), Tailwind CSS v4, IndexedDB. Optional cloud layer in M6: backend, database, object storage, AI, Yjs. |
| **Plan version** | 4.3 (adds M3.5: page setup). 4.2 added M7: Block mode. 4.1 added M6: optional cloud. 4.0 replaced the master product plan, the advanced features implementation plan, the UI redesign plan and the editor documentation. |
| **Last updated** | 2026-10-18 |
| **Status** | Pre-launch. The core editor is built; the work below takes it to a production release. |

---

## Contents

1. [Summary](#1-summary)
2. [Positioning and USP plan](#2-positioning-and-usp-plan)
3. [What "full WYSIWYG" means: scope and status](#3-what-full-wysiwyg-means-scope-and-status)
4. [Current state and launch blockers](#4-current-state-and-launch-blockers)
5. [Roadmap to production](#5-roadmap-to-production)
6. [Architecture](#6-architecture)
7. [Design system and UX standards](#7-design-system-and-ux-standards)
8. [Library productization (`@inkframe-ui/editor`)](#8-library-productization-inkframe-uieditor)
9. [Quality, security and release](#9-quality-security-and-release)
10. [Success metrics](#10-success-metrics)
11. [Decisions and risks](#11-decisions-and-risks)
12. [Appendix: shortcuts and extensions](#12-appendix-shortcuts-and-extensions)

---

## 1. Summary

Inkframe started as an offline Markdown notes app. This plan repositions it as a **full WYSIWYG document editor**: people write in a formatted page that looks the way it will be read, with rich blocks (tables, code, callouts, checklists, images), and never see Markdown syntax unless they want to export it.

Three things make Inkframe different, and every roadmap item below protects or extends one of them:

1. **Private by default.** No account, no server, no telemetry. Documents and images live in the browser's IndexedDB.
2. **Share without a server.** A share link carries the whole document in the URL fragment, which browsers never send to a server.
3. **One editor, two products.** The app is built on the same editor that Angular teams can embed through `@inkframe-ui/editor`.

The core editor is built and tested (110 unit tests; library and app builds pass). The remaining work is in four areas:
- **WYSIWYG gaps:** highlight, text alignment, find and replace, among others.
- **Data safety:** version history, backup and restore, real "clear all data".
- **Claim integrity:** self-hosted fonts, and a landing page that only promises what ships.
- **Launch work:** PWA, deployment, publishing the library.

Before launch, **M3.5 adds page setup**. Each document is either **Pages**, a sheet the size of real paper (A4, Letter, A3, A5 or Legal, portrait or landscape) that prints the way it looks, or **Pageless**, the full canvas. A ruler sets the margins in both, and a page color works in both. This strengthens U2: in Pages layout, the screen and the printout break lines in the same places.

After launch, **M6 adds an optional cloud layer**: accounts, sync across devices, server-side storage, an AI writing assistant and real-time collaboration. It is strictly opt-in. Inkframe keeps working fully without an account, so the privacy promise stays true for everyone who never signs in.

**M7 adds Block mode**, a second, Notion-style way of writing: no toolbar, every paragraph is a block you can drag, turn into something else or nest pages under. Users choose Document mode or Block mode per document and can switch at any time, because both modes edit the same document. M7 needs no backend, so it can ship before, after or alongside M6.

---

## 2. Positioning and USP plan

### 2.1 Positioning statement

> For people who want a polished writing tool without handing their words to a cloud service, **Inkframe** is a full WYSIWYG document editor that runs entirely in the browser. Unlike cloud editors, it needs no account and keeps every document on your device. Unlike Markdown editors, you write on a formatted page instead of in syntax, and still get clean Markdown out.

### 2.2 Target users

| Segment | Who | Job to be done | What wins them |
| --- | --- | --- | --- |
| **Private writers** (primary) | Students, journalists, people drafting sensitive notes | "Write and format a document without creating an account or trusting a server." | Opens instantly, works offline, nothing leaves the device. |
| **Technical writers** | Developers, tech leads, documentation authors | "Write specs and READMEs with real code blocks and tables, then export Markdown." | Syntax-highlighted code, tables, callouts, lossless Markdown export. |
| **Angular teams** (library) | Product teams that need an editor inside their app | "Add a rich-text editor that feels native to Angular and that we can extend." | Signals-based, standalone, an extension API, the full UI included. |

### 2.3 Unique selling propositions

Each USP lists the proof in the product and what must be true before we claim it publicly.

| # | USP | Proof in the product | Must be true before we market it |
| --- | --- | --- | --- |
| **U1** | **Private by default.** No account, no server, no tracking. | Documents and images are stored in IndexedDB; there is no backend API. | Fonts and icons are self-hosted (today they load from Google); no analytics anywhere in the app; "Clear all data" actually clears IndexedDB. |
| **U2** | **True WYSIWYG.** What you see is what you share, print and export. | Formatted page canvas, floating format bar, slash menu, interactive tables, code blocks and checklists. | P0 WYSIWYG features in [section 3](#3-what-full-wysiwyg-means-scope-and-status) shipped: highlight, alignment, find and replace, print/PDF, paste cleanup. |
| **U3** | **Share without a server.** One link carries the whole document. | `/s#<payload>` share links decode client-side; the fragment never reaches a server. | Clear size guidance in the share dialog (images make links long); a graceful error page for broken links. |
| **U4** | **Markdown in, Markdown out.** Write visually and keep portable files. | Markdown import and export round-trips headings, lists, tasks, tables, callouts, code and inline formatting (covered by tests). | "Import Markdown file" in the UI; documented mapping for the few formats Markdown can't express (colors become inline HTML). |
| **U5** | **Developer-grade blocks.** | Code blocks with 15 languages, line numbers, wrap and copy; tables with handles and cell styling; callouts; task lists. | Nothing extra; already shippable. |
| **U6** | **The same editor, as an Angular library.** | `@inkframe-ui/editor` with `/core`, `/toolbar` and `/ui` entry points and an `EditorExtension` API. | Library published to npm with docs, a stable API and versioning ([section 8](#8-library-productization-inkframe-uieditor)). |

**Lead message:** U1 + U2 together ("a real document editor that keeps your words on your device"). U3 is the memorable hook; U4–U6 are supporting pillars for technical audiences.

**After M6, a seventh pillar: U7, cloud when you want it.** Sign in to sync across devices, collaborate live and use the AI assistant; stay signed out and nothing changes. U7 must never weaken U1: every mention says the account is optional, and the app shows clearly which documents live only on the device and which are synced.

**After M7, U2 widens to "WYSIWYG, your way."** Write on a classic page with a toolbar, or in blocks you can drag and rearrange. It is the same document either way, so switching is instant and lossless. This is also a library selling point: Angular teams get both styles from one editor.

### 2.4 Competitive landscape

Category-level comparison. Verify any specific competitor claim against current product pages before using it in marketing.

| Category | Typical examples | Where they are strong | Inkframe's angle |
| --- | --- | --- | --- |
| Cloud document editors | Google Docs, Notion, Microsoft Word for the web | Collaboration, ecosystems, mature features | No account, offline from the first visit, data never leaves the device. |
| Markdown editors and note apps | Typora, Obsidian, StackEdit, Dillinger | Plain-text portability, power-user workflows | Formatted-page WYSIWYG without syntax, plus Markdown export when you need it. |
| Embeddable editor libraries | Tiptap, CKEditor, TinyMCE, Quill, ngx-editor | Framework coverage, plugin ecosystems | Angular-native (signals, standalone), complete UI included, and a full reference app. |

Inkframe does **not** compete on real-time collaboration or cloud sync at launch. Say so plainly in the FAQ instead of implying it. Both arrive in M6 as optional, signed-in features, positioned as "local-first, cloud when you want it" rather than "cloud first".

Block mode (M7) brings the block-editing style people know from Notion-like tools, but Inkframe does **not** compete on databases (table, board and calendar views with properties and filters). Keep that out of scope and say so if asked.

### 2.5 Messaging

| Element | Copy |
| --- | --- |
| Tagline | **Write beautifully. Keep it yours.** |
| Hero subhead | A full WYSIWYG document editor that lives on your device: no account, no server, no tracking. |
| Pillar 1 | **A real page, not syntax.** Headings, tables, code, callouts and checklists, formatted as you type. |
| Pillar 2 | **Private by design.** Everything is stored in your browser. Nothing is uploaded. |
| Pillar 3 | **Share with one link.** The whole document travels inside the link; no server ever sees it. |
| Writing styles line (after M7) | **Write your way.** A classic page with a toolbar, or blocks you can drag and rearrange. Switch any time; it's the same document. |
| Developer line | The editor behind Inkframe is an open Angular library. Drop it into your app. |

**Landing page changes this implies:**
- Replace "Private, local-first markdown app" with WYSIWYG wording.
- Remove "Raw Markdown", "Split View" and PDF claims until they ship.
- Remove "without a single network request" until fonts are self-hosted, and change it to "nothing you write is ever uploaded", which stays true even with external image URLs.

### 2.6 Claims we must not make yet

| Claim | Why not | Unblocked by |
| --- | --- | --- |
| "Zero network requests" / "zero tracking" | Fonts and Material Symbols load from Google servers. | Self-host fonts and icons (M0). |
| "Split view" / "Raw Markdown" | Not built. | Optional Markdown source view (P2) or remove the copy. |
| ~~"Works offline" (after first visit)~~ | ✅ Unblocked by M3. The landing page now says it, with "you can install it as an app". | |
| "Sync across devices", "Collaborate in real time", "AI writing assistant" | Not built. | M6.2, M6.5, M6.4. Always paired with "optional, no account needed to write". |
| "Block mode", "Drag blocks", "Nested pages" | Not built. | M7. Never call it "Notion mode": Notion is a trademark, and "Block mode" is ours. |
| "A4 and Letter pages", "Landscape", "Ruler", "Page color" | Built (M3.5 steps 1–5) and checked in Chrome, not yet released. | Claim once released and checked in Firefox and Safari. |
| "See your pages as they print" | Built (M3.5 step 6) and checked in Chrome, not yet released. | Claim once released and checked in Firefox and Safari. |
| "Headers and footers", "Page numbers" (in print) | Not planned. | Only with clear demand (D19). |

---

## 3. What "full WYSIWYG" means: scope and status

Status key: ✅ shipped · 🟡 partial · ⬜ not started. Priority: **P0** required for launch, **P1** within the first release cycle, **P2** later.

### 3.1 Text and formatting

| Feature | Status | Priority | Notes |
| --- | --- | --- | --- |
| Bold, italic, underline, strikethrough, inline code | ✅ | P0 | Shortcuts and input rules. |
| Subscript, superscript, small text | ✅ | P0 | |
| Text color (21-swatch palette) | ✅ | P0 | Values are sanitized before reaching `style`. |
| Highlight (background color) | ✅ | P0 | 8 pastel colors (text on them stays dark in both themes); `Mod-Alt-H`. Markdown export as `<mark>`; `==text==` imports. |
| Links with safe-protocol allow-list | ✅ | P0 | **Bind `Mod-k`**: the tooltip advertises Ctrl+K but nothing handles it. |
| Clear formatting | ✅ | P0 | |
| Paragraph alignment (left, center, right, justify) | ✅ | P0 | Paragraphs and headings; `Mod-Shift-L/E/R/J`. Kept when a block changes type or Enter starts a new line. Markdown export wraps aligned blocks in `<div align>`. |
| Indent / outdent for paragraphs | ⬜ | P1 | Lists already support Tab and Shift+Tab. Indent handles on the ruler could come later; M3.5's ruler sets margins only. |
| Font family per document (sans, serif, mono) | ⬜ | P1 | A document-level setting, not per character. |
| Line spacing, font size per selection | ⬜ | P2 | Only if users ask; it complicates Markdown export. |

### 3.2 Blocks

| Feature | Status | Priority | Notes |
| --- | --- | --- | --- |
| Headings 1–6, paragraph, quote, divider, hard break | ✅ | P0 | |
| Bullet, numbered and task lists with nesting | ✅ | P0 | Switching between list types keeps content. |
| Code block: 15 languages, line numbers, wrap, copy | ✅ | P0 | Prism highlighting. |
| Callouts (info, warning, success, danger) | ✅ | P0 | Round-trip to `> [!TYPE]` Markdown. |
| Tables: header row, add rows and columns, alignment, cell background, resize | ✅ | P0 | Merged cells import from HTML; no merge UI yet. |
| Images: upload, paste, drag-drop, URL, resize, captions, lightbox | ✅ | P0 | Stored in IndexedDB. |
| **Block drag handle** (move blocks) | ⬜ | P1 | Delivered by M7.2 and available in both modes. |
| Table cell merge and split UI | ⬜ | P1 | `prosemirror-tables` supports it. |
| Toggle (collapsible) block | ⬜ | P1 | Delivered by M7.3 and available in both modes. |
| Math (KaTeX), diagrams (Mermaid) | ⬜ | P2 | Strong for the technical-writer segment. |
| Footnotes | ⬜ | P2 | |

### 3.3 Editing experience

| Feature | Status | Priority | Notes |
| --- | --- | --- | --- |
| Slash command menu, floating selection menu | ✅ | P0 | |
| Grouped toolbar with dropdowns | ✅ | P0 | |
| Undo / redo | ✅ | P0 | |
| Empty-document placeholder ("Type / for commands…") | ✅ | P0 | `PlaceholderExtension`; also exposed as `aria-placeholder`. |
| Find and replace (`Mod-F`, `Mod-H`) | ✅ | P0 | Panel at the top right of the editor; match case, all matches highlighted, replace one or all (one undo step); headings, lists, tables and code. |
| **Paste cleanup** from Word and Google Docs | 🟡 | P0 | `transformPastedHTML`: Word lists, titles and Office markup; Google Docs wrapper and checklists; default colors dropped; DOMPurify. Tested against reconstructed clipboard HTML; still to verify with real captures (see M1). |
| Status bar: words, characters, reading time | ✅ | P0 | 28px bar below the page; shows the selection's word count too. Header pill removed. |
| Document outline (table of contents panel) | ⬜ | P1 | Built from headings. |
| Focus mode / typewriter scrolling | ⬜ | P1 | Fits the distraction-free story. |
| Spell check | ✅ | P0 | Native browser spell check; keep it enabled. |
| Markdown source view | ⬜ | P2 | Only if the landing page keeps promising it. |

### 3.4 Documents, data and sharing

| Feature | Status | Priority | Notes |
| --- | --- | --- | --- |
| Multiple documents, `/docs` library, search, templates | ✅ | P0 | |
| Autosave with "Saving… / Saved" status | ✅ | P0 | Pending edits are flushed when switching or leaving documents. |
| Inline title rename, duplicate, delete | ✅ | P0 | Delete now removes the stored content. |
| **Version history** (local snapshots, restore) | ✅ | P0 | Panel beside the page: automatic versions (every 10 minutes while editing, sooner after 2,000 changed characters, before large deletions and restores), named versions, preview, restore. Kept: everything from the last day, then one a day for 30 days; named versions until deleted. |
| **Backup and restore** (all documents and images in one file) | ✅ | P0 | Settings → Backup. One `.inkframe.json` with documents, version history and images. Restore merges (never overwrites; a changed document comes back as "… (restored)") or replaces all. |
| **"Clear all data" that clears IndexedDB** | ✅ | P0 | Done in M0 (B3); version history is deleted too. |
| Storage-full or blocked banner with "Export backup" | ✅ | P0 | The editor shows "Not saved"; the backup includes the refused edits. Also shown when the browser blocks IndexedDB (limited) or all storage. |
| Share links in the URL fragment (`/s#…`) | ✅ | P0 | Older `/s/<hash>` links still open. |
| Share dialog: size warning, native share sheet | ⬜ | P1 | Warn when images make links very long. |
| Export: Markdown | ✅ | P0 | |
| **Export: HTML, print / PDF** | ✅ | P0 | Export menu: Markdown, Web page (.html, styled, images embedded, no network requests), Print or save as PDF (`Mod-P`), Copy as Markdown. Printing uses the HTML page in a hidden frame. |
| Export: JSON (lossless), DOCX | ⬜ | P1 / P2 | |
| Import: Markdown and HTML files | ✅ | P0 | Import button and drag and drop on `/docs`; one document per file; embedded images move to image storage. |
| Image garbage collection | ⬜ | P1 | Images of deleted documents stay in IndexedDB. |

### 3.5 Platform

| Feature | Status | Priority | Notes |
| --- | --- | --- | --- |
| Light and dark theme | ✅ | P0 | |
| **Self-hosted fonts and icons** | ✅ | P0 | Done in M0 (B1). |
| **PWA: installable, offline after first visit** | ✅ | P0 | Angular service worker (production builds). Install from the sidebar or Settings → App (iPhone and iPad: Share → Add to Home Screen). Updates show a "Reload" toast, which saves edits first. |
| Mobile: keyboard-pinned toolbar, bottom sheets | 🟡 | P1 | Built in M3: toolbar below the page on phones and above the on-screen keyboard, menus and Share as bottom sheets, 44px touch targets, safe-area insets. Checked in emulation; still to test on real iOS and Android devices. |
| Accessibility: WCAG 2.1 AA | 🟡 | P0 | Needs an axe audit and `aria-activedescendant` on the slash menu. |
| Internationalization | ⬜ | P2 | |

### 3.6 Page setup (M3.5)

| Feature | Status | Milestone | Notes |
| --- | --- | --- | --- |
| Page setup per document: layout, paper size (A3, A4, A5, Letter, Legal), orientation, margins | ✅ | M3.5, step 1 | Stored in the document, so share links, backups and version history carry it. Opens from the Export menu and a layout button in the status bar (not on touch screens). |
| Print and PDF on the document's paper size and margins | 🟡 | M3.5, step 1 | `@page` sizes written in millimeters; the print frame uses the app's fonts. Checked in Chrome; Firefox and Safari still to check. |
| Pageless layout: the full canvas | ✅ | M3.5, step 2 | No fixed width; 10% side margins until the ruler (step 3) sets them. Replaced the 820px sheet and the planned width toggle. |
| Pages layout: a sheet at the paper's real width | 🟡 | M3.5, step 2 | Same text width, fonts, font size and text settings as the printout, so lines break in the same places (checked in Chrome; Firefox and Safari still to check). Phones reflow. |
| Ruler with margin handles | ✅ | M3.5, step 3 | Both layouts, from 768px up. Keyboard-operable. Turned off in Settings → Editor. |
| Page color | ✅ | M3.5, step 4 | Six colors, each with a light and a dark value. Printing it is optional (checked in Chrome; Firefox and Safari still to check). |
| Page break block | ✅ | M3.5, step 4 | `Mod-Enter` or the slash menu; HTML and Markdown round trip. |
| Zoom (fit width, 50–200%) | ✅ | M3.5, step 5 | In the status bar, Pages layout only. Sheets wider than the editor open fitted. Checked in Chrome; Firefox and Safari still to check. |
| Page view: separate sheets on screen, text flowing across them, page numbers in the gap | ✅ | M3.5, step 6 | Split with the print rules. In the editor, the reader and version previews. Printouts have the pages shown on screen (checked in Chrome; Firefox and Safari still to check). |
| Headers, footers and page numbers in print | ⬜ | M5, only if users ask | See D19. |

### 3.7 Optional cloud features (signed-in only, M6)

| Feature | Status | Milestone | Notes |
| --- | --- | --- | --- |
| Accounts: email magic link, Google and GitHub sign-in | ⬜ | M6.1 | Never required to use the editor. |
| Account deletion and full data export | ⬜ | M6.1 | Deletion removes all server-side data. |
| Per-document sync ("Sync" / "Keep on this device") | ⬜ | M6.2 | Local copy stays primary; works offline. |
| Sync status and conflict copies | ⬜ | M6.2 | Concurrent edits never silently overwrite. |
| Cloud image storage | ⬜ | M6.3 | Synced documents' images move to private object storage. |
| Revocable public links (`/p/<id>`) | ⬜ | M6.3 | Opt-in alternative to fragment links for large documents. |
| AI assistant: continue, summarize, improve, shorten, fix grammar, translate, change tone | ⬜ | M6.4 | Suggestions need an explicit Accept; one undo step. |
| Real-time collaboration: live cursors, presence, roles | ⬜ | M6.5 | Yjs; undo affects only your own edits. |
| Comments and suggestions (track changes) | ⬜ | After M6.5 | Builds on collaboration roles. |

### 3.8 Block mode (M7)

| Feature | Status | Milestone | Notes |
| --- | --- | --- | --- |
| Writing style per document (Document / Block), default in Settings | 🟡 | M7.1 | The editor can already hide its toolbar and swap extension sets; no UI or stored preference yet. |
| Block canvas: no toolbar, "Type / for commands" on the active empty line | ⬜ | M7.1 | |
| Slash menu with "Turn into" items | 🟡 | M7.1 | The slash menu exists; "Turn into" does not. |
| Block handles (**+** to insert, **⋮⋮** for the block menu) | ⬜ | M7.2 | Tap to show on touch screens; `Mod-/` opens the block menu from the keyboard. |
| Block menu: Turn into, Duplicate, Delete, Move up and down, Color | ⬜ | M7.2 | |
| Drag and drop blocks, including list items | ⬜ | M7.2 | Keyboard equivalent: `Mod-Shift-↑` / `Mod-Shift-↓`. |
| Select and move or delete several blocks at once | ⬜ | M7.2 | |
| Toggle (collapsible) block | ⬜ | M7.3 | Replaces the P2 toggle row in [3.2](#32-blocks). |
| Page icon (emoji) and cover image | ⬜ | M7.3 | Shown on library cards and in the page tree. |
| Sub-pages, page link block, sidebar page tree, breadcrumbs | ⬜ | M7.3 | `[[` links an existing page. |
| Columns (2–4 side by side) | ⬜ | M7.4 | Optional; stacks on mobile. |
| Databases (table, board, calendar views with properties) | — | Out of scope | See decision D16. |

---

## 4. Current state and launch blockers

### 4.1 Baseline (2026-10-14)

- **Tests:** 311 tests pass through the Angular CLI test runner (`npm test`; 227 library, 84 app): schema, commands, input rules, Markdown and HTML I/O, sanitization, table UI, find and replace, paste cleanup, document statistics, the editor service against the extension-built schema, `<ink-editor>` component behavior, toolbar focus, on-screen keyboard tracking, share codec, document storage, storage errors, version history, backup round trips, import, the storage banner, install and update handling, and the `/new` route.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs the Prettier format check, ESLint (angular-eslint, including the template accessibility rules), the icon-subset check, all tests, both production builds and a check that the built app loads nothing from third-party origins.
- **Builds:** library (`npm run build:lib`) and app (`npm run build:app`) build cleanly. Initial app bundle: 581 kB raw, 136.5 kB transferred (M3 added 4.5 kB: service worker registration and install handling; M2 added 4 kB). Production builds include the service worker (`ngsw-config.json`): it caches 1.8 MB up front (all scripts, styles and the Latin fonts) and the other fonts and icons when first used.
- **Schema:** version 4. M1 added the `highlight` mark and the `align` attribute (version 2); version 3 dropped fixed table row heights so rows fit their text; version 4 added list attributes shared by all list types. Older documents migrate on load.
- **Recently fixed:**
  - **Keyboard:** Tab and Shift+Tab indent list items again (the table extension's Tab binding had replaced them). Extensions that bind the same key now run in order until one handles it.
  - **Floating menu:** Bold, italic, underline, strikethrough, code and link no longer appear twice.
  - **Paste:** text copied from Word or Excel is pasted as text; before, the picture of the selection that Office also puts on the clipboard was inserted instead.
  - **Editor and Markdown:** toolbar commands now use the live schema; Markdown import is lossless for the formats export writes.
  - **Data safety:** no lost edits when switching documents; deletes remove stored content.
  - **Isolation:** table controls are scoped per editor.
  - **Security and sharing:** CSS-value and DOMPurify hardening on shared documents; share links moved to the URL fragment, fixing HTTP 431 on large documents; Tailwind restored on the landing page.

### 4.2 Launch blockers (must fix before public launch)

| # | Blocker | Where | Fix |
| --- | --- | --- | --- |
| B1 | ~~Fonts and icons load from Google~~ | `src/index.html` | ✅ Done in M0. Inter and JetBrains Mono are self-hosted (Fontsource); Material Symbols is a 6.7 kB subset of the 69 icons in use (`npm run icons:build`). |
| B2 | ~~Landing page promises features that don't exist~~ | `src/app/features/landing/landing.html` | ✅ Done in M0. WYSIWYG positioning; Split View, PDF and HTML export, "encrypted" and offline claims removed; fabricated testimonials and the Pricing section removed; shortcut table corrected; dead links replaced. |
| B3 | ~~"Clear all data" leaves documents in IndexedDB~~ | `src/app/features/settings/settings.ts` | ✅ Done in M0. Deletes the database (other tabs release it), keeps preferences, uses the confirm dialog; storage usage now reported from `navigator.storage`. |
| B4 | ~~History button does nothing~~ | `toolbar.ts` → `historyRequested` | ✅ Done in M2: the button opens the version history panel. |
| B5 | ~~`Ctrl+K` advertised but unbound~~ | `extensions/link/link-extension.ts` | ✅ Done in M0. Opens the floating menu's link popover when text is selected, otherwise the toolbar's; the URL field is focused. |
| B6 | SSR server rejects every host | `angular.json` → `security.allowedHosts: []` | Set production hosts, or `NG_ALLOWED_HOSTS` at deploy time. |
| B7 | ~~No backup and restore~~ | Settings | ✅ Done in M2: Settings → Backup, and the storage banner. |
| B8 | README is the Angular CLI placeholder | `README.md` | Product README plus library README ([section 8](#8-library-productization-inkframe-uieditor)). |

### 4.3 Technical debt (fix during M0–M2)

- **Dead preset code:** the editor page defines extension presets and a demo plugin with no UI. Either expose presets in a developer playground or remove them.
- **Legacy APIs:** ~~`buildPlugins()` and `SLASH_ITEMS`~~ are marked `@deprecated` (with `buildInputRules()`, in `core/legacy/`) and point users to `ExtensionManager` and `DEFAULT_EXTENSIONS`. Still open: the static `schema` export, which predates the extension system but is what the Markdown and HTML converters use.
- ~~**Component tests can't run.**~~ Resolved in M0: tests run through `ng test` (AOT, type-checked). The first component test found that `<ink-editor>` cannot emit edits while being destroyed; edits are now flushed by a `canDeactivate` guard and on `visibilitychange` / `pagehide`.
- ~~**No linter.**~~ Resolved: angular-eslint (`npm run lint`) runs in CI. Specs may use `any`; template accessibility exceptions are commented where they are made.
- ~~**Formatting isn't enforced.**~~ Resolved: the codebase was formatted in one commit (listed in `.git-blame-ignore-revs`) and `format:check` runs in CI. `.gitattributes` keeps checkouts on LF so the check passes on Windows too.
- ~~**Failed saves are silent.**~~ Resolved in M2: writes throw a `StorageError` and report to `imageStorage.onWrite` listeners; the editor shows "Not saved" and the storage banner offers a backup. A related bug was fixed too: after an IndexedDB quota error, the edit used to go to localStorage, where the older IndexedDB copy hid it on reload.
- **Image saves on a full disk:** inserting an image when storage is full now shows the banner, but the image is silently not inserted. Show a message at the insertion point.
- **Unknown document ids:** opening `/doc/<unknown id>` creates a document but the sidebar only lists it after its first save.
- **Reader images are mouse-only:** a click opens the lightbox, but images cannot be focused. Fix in the M4 accessibility pass.
- **Global window events:** the column-menu event is filtered per editor but still travels through `window`. Move it to the editor service.
- **Uncompressed responses:** `src/server.ts` sends files without compression, so a first visit (and the service worker's download) is about 1.8 MB instead of roughly 450 kB. Add compression, or serve the static files from a CDN, in M4.
- **Long share links:** images are inlined, so share links can reach hundreds of kilobytes. Some chat apps truncate long URLs; document the limit and warn in the share dialog.

---

## 5. Roadmap to production

Milestones are sequential; work inside a milestone can run in parallel. Sizes: **S** ≤ 2 days, **M** ≤ 1 week, **L** > 1 week.

```
M0 Stabilize ─► M1 WYSIWYG completeness ─► M2 Data safety & export ─► M3 Mobile & PWA ─► M3.5 Page setup ─► M4 Launch ─┬─► M5 Growth
                                                                                                                       ├─► M6 Optional cloud
                                                                                                                       └─► M7 Block mode
```

M3.5 sits between M3 and M4, so page setup ships at launch, and the later milestones keep their numbers. M5, M6 and M7 run in parallel after launch. Neither M6 nor M7 starts before M4: the local-first product ships first and keeps working on its own. M7 does not depend on M6; once both exist, sub-pages sync like any other document.

### M0: Stabilize and make the claims true

**Status (2026-10-12):** done. One manual step remains: make the CI workflow required for merging to `master` in the GitHub branch settings.

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Self-host fonts and icons (B1) | S | Network panel shows no third-party requests in the editor. CI enforces it. |
| ✅ Fix "Clear all data" (B3) and bind `Mod-k` (B5) | S | Tests cover both. |
| ✅ Landing page copy rewrite (B2) | S | Every claim maps to a ✅ row in [section 3](#3-what-full-wysiwyg-means-scope-and-status). |
| ✅ Angular test runner for component tests | M | Editor component tests (flush on switch, before destroy and on page hide) run in CI. |
| ✅ CI pipeline: lint, format check, tests, both builds | S | All run, with the icon check and third-party check. Make the workflow required for merging to `master` in the GitHub branch settings. |

### M1: WYSIWYG completeness (all P0 editing features)

**Status (2026-10-12):** built and unit-tested. Still open: replacing the reconstructed paste fixtures (`core/paste-cleanup.fixtures.ts`) with HTML captured from real Word and Google Docs clipboards, and a manual pass in a browser.

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Highlight mark and paragraph alignment | M | Toolbar, floating menu, shortcuts, HTML and Markdown export (inline HTML fallback). |
| ✅ Find and replace | M | Case-sensitive toggle, highlights all matches, replace one or all, works in tables and code. |
| 🟡 Paste cleanup from Word and Google Docs | M | Fixture tests with real clipboard HTML from both sources. Cleanup and fixture tests exist; the fixtures are reconstructions of each format, not captures. |
| ✅ Document placeholder and status bar | S | Words, characters and reading time in a 28px bar; header pill removed. |

### M2: Data safety and export

**Status (2026-10-14):** done. Unit tests cover every exit criterion; an end-to-end run against the production build in Chrome checked history, export, print, backup and restore, import, and a simulated full disk (IndexedDB transactions aborted with `QuotaExceededError`; Chrome's quota override had no effect in headless mode).

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Version history | L | Automatic snapshots (time- and size-based), list with previews, restore creates a new snapshot, retention limit. |
| ✅ Backup and restore | M | One `.inkframe.json` file with documents and images; restore merges or replaces; round-trip test. |
| ✅ Export HTML and print / PDF | M | Print stylesheet hides UI; page breaks avoid splitting code blocks and table rows. |
| ✅ Import Markdown and HTML files | S | Import creates a new document; drag a file onto `/docs` to import. |
| ✅ Storage-full and blocked banners | S | Simulated quota errors show the banner with "Export backup". |

### M3: Mobile and PWA

**Status (2026-10-14):** built, and tested in Chrome's phone emulation against the production build. Still open: a pass on real iOS Safari and Android Chrome devices, because an on-screen keyboard cannot be emulated (the checks replaced the `visualViewport` size instead). Lighthouse 12 removed its PWA category; Chrome's own installability check reports no errors.

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Service worker, manifest, install prompt | M | App starts offline after one visit: with the server stopped, the landing page, library, editor, settings and reader all load, and edits are kept. Installable (no installability errors in Chrome); "Install app" in the sidebar and Settings → App. Updates offer "Reload", which saves edits first. A `/new` shortcut creates a document. |
| 🟡 Keyboard-pinned mobile toolbar (`visualViewport`), bottom-sheet drawers | M | On phones the toolbar sits below the page. `VisualViewportTracker` keeps the layout above a keyboard that covers the page (iOS); `interactive-widget=resizes-content` makes Chrome on Android resize the page instead. Menus, Export and Share open as bottom sheets. Toolbar presses keep focus, and so the keyboard, in the document. Still to test on iOS Safari and Android Chrome devices. |
| ✅ Touch targets ≥ 44px, safe-area insets | S | Every control on touch screens is at least 44px (checked across pages, menus, panels and dialogs; task checkboxes get a 44px-wide label). Header, sidebar, toolbar, sheets and page ends respect `env(safe-area-inset-*)`. |

### M3.5: Page setup

**Goal:** each document chooses its layout:

- **Pages:** a sheet the size of real paper (A4, Letter, A3, A5 or Legal, portrait or landscape) that prints the way it looks.
- **Pageless:** the full canvas, edge to edge.

A ruler at the top of the canvas sets the margins in both layouts, and a page color works in both.

**Status (2026-10-19):** steps 1–6 built and checked in Chrome; the browser checks in Firefox and Safari (printing, line breaks, page color, zoom and page view) are what is left. Details per step follow.

Step 1 built. Unit and component tests cover it, and a run against the production build in Chrome checked the dialog in both themes and on a phone, real keyboard and mouse input, autosave, and a PDF printed at A4 landscape. Still open in step 1: print checks in Firefox and Safari, and printing offline.

Step 2 built (2026-10-18), with tests and a Chrome run against the production build: Pageless fills the canvas with 10% margins; Pages shows the sheet at paper size (A4 794 × 1123px, A3 landscape scrolling sideways on a 1280px window); phones reflow an A3 landscape document with no sideways scrolling; the reader and version previews show each document in its own layout. On a long test document (17 blocks, 82 lines: headings, paragraphs with bold and inline code, nested and numbered lists, a quote), every line breaks in the same place in the editor and on the print page. That needed the print page to copy three text settings the editor has: the app's letter spacing (−0.011em on `body`), no ligatures and `white-space: break-spaces` (both from ProseMirror's stylesheet). Still open in step 2: the same check in Firefox and Safari, and tables, code blocks and callouts, where the editor draws extra controls (table handles, line numbers, icons) that the printout does not have. Printing from the reader also uses the document's paper and margins now.

Step 3 built (2026-10-18), with tests and a Chrome run with real mouse and keyboard input against the production build. The handles sit exactly on the text column's edges (A4, Pageless, and A3 after scrolling sideways). Dragging previews the margin with a guide line and its size, and leaves the document unchanged until release; one undo step reverts it. Keys move a handle 1 mm (1 cm with Shift) on A-series paper. Two changes from the plan: "Show ruler" is a switch in Settings → Editor (there is no `⋯` menu), and on Letter and Legal the steps are 1/16 and 1/4 inch, so values stay in round inches. On touch screens the handles take touches 44px wide, reaching 20px below the ruler.

Step 4 built (2026-10-18), with tests and a Chrome run against the production build. Six page colors (Cream, Sage, Sky, Lavender, Rose, Gray), each keeping WCAG AA contrast for text, muted text and links in both themes (a test computes it). Printing a color uses an `@page` background: Chrome's `html` background stops at the page margins, while `@page` fills the whole sheet; the printed PDF shows the color across the full sheet on every page. `Mod-Enter` splits a paragraph at the cursor rather than always going after the block, as in Word and Google Docs; in lists, tables and callouts it goes after the top-level block, since page breaks are top-level only. Still open in step 4: the print checks in Firefox and Safari.

Step 5 built (2026-10-18). Zoom is CSS `zoom` on the Pages sheet, which scales its layout box, so sideways scrolling and centering keep working. A run with real mouse and keyboard input against the production build in Chrome, at 50, 75, 100, 125 and 150% and Fit width, checked: the sheet size, the ruler on the text column, a click placing the caret inside a word, a drag selecting it, the floating menu above the selection, the slash menu below the caret, table row handles, the list drag handle, image resizing and table column resizing (the border under the pointer). Three things needed fixing for it: the list drag handle and image resizing measured in screen pixels and positioned in CSS pixels; the drag handle was positioned against an unzoomed ancestor, where Chrome offsets it vertically (it is now positioned inside the page); and prosemirror-tables' column resizing moved the border at zoom × the pointer's speed (a small plugin passes its mouse events on with the distance scaled back). The editor keeps a stable scrollbar gutter, so Fit width cannot flip between two widths. Still open in step 5: the same run in Firefox and Safari.

Two changes from the plan: the top bar has no `⋯` menu, so Page setup opens from the Export menu, next to Print. On touch screens the status bar button is hidden, because the 28px bar has no room for a 44px target; the Export menu covers them.

Step 6 built (2026-10-19), with tests and a Chrome run against the production build. The test document has 12 pages: headings, paragraphs, a bullet, a numbered and a task list, a 20-row table, a code block, a callout, a page break and long paragraphs. On it, no line of text crosses a page's margins, in the editor or the reader, also after typing.

- **Printing from the editor** gives the same pages. The editor passes the positions where its pages start, and the print copy gets a page break at each (`withPageStarts`), splitting a paragraph, list or table there. Both have 12 pages, and the print copy's pages start with the same words as the screen's. (The PDF's text itself was not read: there is no PDF reader on the test machine.)
- **Printing from the reader** makes each spacer a page break: 12 pages on screen, 12 printed. This also fixed a bug from before M3.5: the reader printed only its first page, in both layouts, because the page kept the screen's height (`ink-reader` is `100dvh` with `overflow: hidden`).
- **The reader and the editor** split the same way, except around tables and code blocks, where the editor's handles and toolbar take room. On the test document, pages 3–5 start one or two table rows apart, and the page break brings them back together.
- **A page before a list item** starts before the whole item, so its bullet, number or checkbox moves with it. (Starting it at the item's first line left task checkboxes on the page before.)
- **Typing** on a 5,700-word document (14 pages) costs the same with page view as without it: a median of 7.5 ms per keystroke against 8.5 ms in Pageless, both measured from the key press to the end of layout. The pages are laid out again 120 ms after typing stops. That takes one 15 ms frame on the test machine, and 92 ms with the CPU slowed 4×: about 20–30 ms of reflow (without the spacers to measure, then with the new ones), 10–15 ms of measuring, and the rest redrawing the spacers. Measuring only from the edited page on is the next improvement.

Known limits: a list item taller than a page splits, and in print its bullet or number shows again on the next page. Inside a nested list taller than a page, the printout starts that page before the outer list. A callout split across pages shows its icon on both. Still open in step 6: the checks in Firefox and Safari, and laying out only from the edited page on.

**Rules for every M3.5 feature:**

1. **Page setup belongs to the document.** It is stored as a `page` attribute on the `doc` node (see [6.4](#64-data-and-storage)). Share links, backups and version history carry it, and every change is one undo step (D17).
2. **Pages on screen are the printed pages.** Pages layout shows each page as a sheet of the paper's size, split with the same rules as printing (step 6). Page break blocks give exact control where it matters (D19).
3. **In Pages layout, the screen matches the printout.** Screen and paper use the same text width, font files and font size, so lines break in the same places.
4. **Pageless means the full canvas.** There are no fixed-width presets; the ruler sets the margins (D18).
5. **Phones reflow.** Under 768px, both layouts show today's full-bleed sheet with 16px margins and no ruler. Printing still uses the document's paper and margins.
6. **Library first, keyboard complete.** Built as `PageSetupExtension` and an `ink-ruler` component in `@inkframe-ui/editor`. Everything the ruler does can also be done from the keyboard in the Page setup dialog.

**Sequence:** step 1 → step 2 → step 3. Step 4 can run alongside step 3, and step 5 comes last. Schema version 5 covers both the `page` attribute and the `page_break` block. If they ship in separate releases, each one bumps the version.

#### Step 1: Page setup settings and print

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ `page` attribute on the `doc` node in the core `DocExtension`, so a document never fails to load when `PageSetupExtension` is off. It is defined in full now (layout, paper, orientation, margins, Pageless side margins, page color, print color), so later steps need no further schema change. `SCHEMA_VERSION` goes from 4 to 5 with a no-op migration. | S | Documents saved before M3.5 load as Pageless (fixture test). Malformed values from share links fall back to the defaults (tests). Older app versions refuse version 5 documents with the existing "newer schema" error. |
| ✅ `EditorService.pageSetup` signal and a `setPageSetup()` command (`tr.setDocAttribute`) | S | Each change is one transaction: one undo step, one autosave. |
| ✅ Page setup dialog: layout, paper size, orientation, margins and Set as default. Margin presets are Narrow (12.7 mm), Normal (25.4 mm) and Wide (25.4 mm top and bottom, 50.8 mm left and right), or custom values in cm for A-series paper and inches for Letter and Legal. Opens from the Export menu and from a layout button in the status bar ("Pageless", "A4 · Portrait"). | M | Works with the keyboard only. Switching layouts keeps the other layout's settings. New documents use the default. The first default is Pageless, with Letter paper in the US and Canada and A4 elsewhere. Margins always leave at least 50 mm of text width and height. |
| 🟡 Print and PDF: `docToHtmlDocument` writes `@page` rules with the paper size in millimeters and the document's margins | S | Save as PDF produces the chosen size and orientation in Chrome, Firefox and Safari 18.2+ without any change in the print dialog. Sizes are always explicit (`size: 297mm 210mm`), because Safari supports `size` but not the `landscape` keyword. Pageless documents print as today. Checked in Chrome; Firefox and Safari still to check. |
| 🟡 Print frame fonts: copy the app's `@font-face` rules for Inter and JetBrains Mono into the print frame. It is same-origin, so the service worker serves the files offline. | S | Printouts use Inter, offline too. In Pages layout, print uses the editor's font size instead of a fixed 11pt. Checked online in Chrome; printing offline still to check. |
| ✅ Exports and round trips | S | HTML export keeps the layout; HTML import doesn't read it back. Markdown export drops it, and the library README says so. Share links, backup and restore, and version restore keep it (tests). |

#### Step 2: Layouts on screen

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Pageless: the full canvas in the page surface color, with no sheet border. Side margins are stored as a share of the canvas width (10% each side by default). | M | From 768px up, margins never go under 32px, so table and list handles stay visible, and the text column is never narrower than 320px. A document set up on a wide monitor keeps its proportions on a laptop. |
| 🟡 Pages: one sheet at the paper's width in CSS millimeters (A4 portrait 794px, Letter 816px, A3 landscape 1587px), with the margins as padding. The canvas scrolls sideways when the sheet is wider than the window. | M | Lines break in the same places on screen and in the print preview. Check a long test document in Chrome, Firefox and Safari. Chrome: all 82 lines of the test document match. Firefox and Safari still to check. |
| ✅ The reader, the version preview and the loading skeleton follow the document's layout | S | None of them keeps a fixed 760–820px width any more. |
| ✅ Phones (under 768px) | S | Both layouts show the full-bleed sheet. An A3 landscape document reads on a phone without sideways scrolling. |

#### Step 3: Ruler

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ `ink-ruler` in `/ui`: a 24px strip between the toolbar and the canvas. It stays in place while the page scrolls down and moves with the page when it scrolls sideways. | M | Lines up with the text column at every window width and scroll position. The find panel moves down below it. |
| ✅ Margin handles over shaded margins: cm for A-series paper, inches for Letter and Legal. Pageless shows the same handles. | M | Dragging previews the new margins without changing the document; releasing commits one transaction (one undo step, one autosave). Hit areas are 44px on touch screens. |
| ✅ Keyboard and screen readers: each handle is a `role="slider"`. Arrow keys move it 1 mm (1/16 inch on Letter and Legal, 1% in Pageless), and Shift+arrow moves it 10 mm (1/4 inch, 5%). Left and Right move the handle the way it looks; Up and Down change the margin's size. | S | Screen readers announce each handle with its value, for example "Left margin, 2.5 cm". |
| ✅ Show ruler: a preference in Settings → Editor (no `⋯` menu exists), not stored in the document. On by default from 768px up; always hidden on phones. | S | |

#### Step 4: Page color and page break

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Page color from a fixed palette (`PAGE_COLORS`), each color with a light and a dark value. The document stores the color's name, never a CSS value. | M | Text keeps WCAG AA contrast on every page color in both themes. Pageless colors the whole canvas; Pages colors the sheet. |
| 🟡 Page color in print and exports: "Print page color" in Page setup, off by default. HTML export always keeps the color (light value). | S | When printed, the color covers the whole sheet, margins included, in the Chrome, Firefox and Safari print previews. Chrome: the whole sheet on every page (`@page` background). Firefox and Safari still to check. |
| ✅ `page_break` block, top level only. Insert it from the slash menu ("Page break") or with `Mod-Enter`: at the cursor in a top-level paragraph or heading, otherwise after the top-level block that holds the cursor. In task lists `Mod-Enter` still checks the task, and in code blocks it still leaves the block. On screen it shows as a dashed line labeled "Page break". | S | Prints as `break-after: page`. HTML export writes `<div class="ink-page-break">`; Markdown writes the same div as inline HTML and reads it back (round-trip tests). |

#### Step 5: Zoom

| Work | Size | Exit criteria |
| --- | --- | --- |
| 🟡 Zoom for Pages layout: Fit width and 50–200%, in the status bar. A preference per device, not stored in the document. Sheets wider than the canvas open at Fit width. | M | Caret placement, selection, the floating and slash menus, table handles, image resizing and the ruler all work at 50, 75, 125 and 150% in Chrome, Firefox and Safari (tests). Chrome: all of them, and table column resizing, at every level. Firefox and Safari still to check. |

#### Step 6: Page view (real pages)

Added 2026-10-18 by request, changing D19: Pages layout shows real pages on screen, each as wide and as tall as the paper, with the text flowing from one to the next.

| Work | Size | Exit criteria |
| --- | --- | --- |
| ✅ Pagination rules: a pure function that takes the measured lines, rows and blocks and decides where each page starts, with the print rules. Paragraph lines split across pages, with at least 2 lines on each side (orphans and widows). Code blocks, quotes, callouts, list and task items, table rows and images stay whole when they fit a page, and split by line or row when taller than one. Headings stay with the next block. Page breaks start a new page. | M | A unit test for each rule. |
| ✅ Editor: separate sheets with a gap between them, and "Page 2 of 5" in the gap. The text moves to the next sheet through spacers (decorations), never by changing the document. Recomputed 120 ms after the last change, not while text is being composed (IME). Off in Pageless and under 768px, where phones reflow. Follows the zoom. | L | The document JSON never contains spacers; undo, copy, paste, find, the ruler and the zoom are unaffected. Typing costs the same as in Pageless on a 5,700-word document (median 7.5 ms per keystroke). The relayout after a pause takes 15 ms (92 ms on a CPU slowed 4×). |
| ✅ Reader and version previews: the same pages (`inkPageView` and `<ink-page-frames>`, built on `StaticPageView`) | M | Split by the same rules as the editor. Pages differ only where the editor's table handles and code toolbar take extra room. |
| 🟡 Printouts match the screen: the editor's print copy breaks where its pages start (`withPageStarts`); the reader prints each spacer as a page break | S | On the test document, as many printed pages as on screen (Chrome: 12 and 12, in the editor and the reader), and the editor's print copy starts each page with the same words as the screen. Firefox and Safari still to check. |

**Out of scope for M3.5:**

- Headers, footers and page numbers in print. They go to M5, and only if users ask (D19).
- Indent handles and tab stops on the ruler.
- Different page sizes within one document, such as a landscape page in a portrait document.
- Custom paper sizes in the UI. Host apps can still add sizes to `PAPER_SIZES`.

### M4: Launch

| Work | Size | Exit criteria |
| --- | --- | --- |
| Accessibility audit (axe and keyboard-only pass) | M | No critical or serious axe issues; WCAG 2.1 AA contrast in both themes. |
| Production deployment | S | Allowed hosts configured; caching headers; error pages. |
| Publish `@inkframe-ui/editor` 1.0 | M | See [section 8](#8-library-productization-inkframe-uieditor). |
| Landing SEO and social cards | S | Prerendered landing, Open Graph image, sitemap. |

### M5: Growth (P1 and P2, ordered by expected value)

1. Document outline, focus mode (P1). Block drag handles moved to M7.2.
2. Share dialog with size warning and native share sheet; JSON and DOCX export (P1)
3. Image garbage collection, table merge UI (P1)
4. Math and diagrams for technical writers (P2)
5. Only if users ask: headers, footers and page numbers in print (D19)

Cloud short links and real-time collaboration moved to [M6](#m6-optional-cloud-accounts-sync-ai-and-collaboration).

### M6: Optional cloud: accounts, sync, AI and collaboration

**Goal:** give people who want them sync across devices, collaboration and AI, without taking anything away from people who don't.

**Rules for every M6 feature:**

1. **The account is never required.** Signed out, Inkframe behaves exactly as it does after M4.
2. **The local copy stays primary.** Edits are written to IndexedDB first, then synced. Signed-in users can still work offline.
3. **The user chooses per document.** Each document is either "Synced" or "On this device only". At sign-in, the user picks which existing documents to upload; nothing uploads silently.
4. **Disclose whenever content leaves the device:** sync badges in the library, a label on every AI action.
5. **Providers stay behind interfaces** (`DocumentStore`, `ImageStore`, `AuthService`, `AiProvider`, collaboration provider; see [section 6.6](#66-optional-cloud-architecture-m6)) so the backend can be swapped.

**Backend choice (open decision D10):**

| Option | Gives you | Trade-off |
| --- | --- | --- |
| **Supabase** (recommended) | Auth, Postgres with row-level security, object storage and edge functions in one service | Vendor coupling, reduced by the interfaces above. Fastest path. |
| Firebase | Auth, Firestore, Cloud Storage, functions | NoSQL document model; less natural for version history and permission queries. |
| Custom: Express (extend `src/server.ts` or a separate service) + Postgres + S3-compatible storage + an auth library | Full control, no vendor coupling | The most work: auth, migrations, storage signing and scaling are yours to build and run. |

Collaboration needs a Yjs sync server (Hocuspocus or y-websocket) whichever option is chosen.

**Sequence:** M6.1 → M6.2 → M6.3 → M6.5. M6.4 (AI) can start as soon as M6.1 is done.

#### M6.1: Backend foundation and accounts

| Work | Size | Exit criteria |
| --- | --- | --- |
| Provision dev, staging and production environments; secrets management | S | No secrets in the client bundle or the repository. |
| `AuthService` (signals: `user`, `status`) with magic link, Google and GitHub | M | Signing in and out never changes or hides local documents. |
| Account section in `/settings`: profile, sign out, export my data, delete account | M | Account deletion removes every server-side row and file (verified by a test). |
| Sign-in entry points: top bar avatar menu, settings | S | No route requires an account. |

#### M6.2: Cloud document storage and sync

| Work | Size | Exit criteria |
| --- | --- | --- |
| Split `DocumentManager` into `LocalDocumentStore` (current IndexedDB code) and `CloudDocumentStore`, coordinated by a `SyncEngine` | M | Signed-out behavior is unchanged (existing tests pass untouched). |
| Server tables `documents` and `document_versions` (see [6.6](#66-optional-cloud-architecture-m6)) with per-owner access rules | M | A user can never read or write another user's rows (tested at the API level). |
| Optimistic concurrency: each save sends the version it was based on; the server rejects stale saves | M | Two devices editing the same document never lose data: the losing edit becomes a "conflict copy" document. |
| Offline queue: pending saves stored in IndexedDB and replayed on reconnect | M | Edits made offline sync after reconnect, in order. |
| Sync status per document (Synced, Syncing, Offline, Conflict) in the editor top bar and on library cards | S | |
| Deletions sync as tombstones; version history from M2 syncs too | S | Deleting on one device removes the document everywhere. |

#### M6.3: Images in object storage and public links

| Work | Size | Exit criteria |
| --- | --- | --- |
| Upload `ink-idb:` images of synced documents to a private bucket; reference them as `ink-cloud:<id>` and resolve through `imageStorage.resolveUrl` with signed URLs and a local cache | M | A synced document with images opens on a second device; images keep working offline once cached. |
| Server-side validation: image types only, a size limit (for example 10 MB), a per-user storage quota | S | Oversized or non-image uploads are rejected with a clear message. |
| Opt-in public links `/p/<id>` for synced documents, revocable, with optional expiry | M | Revoking a link stops access immediately. Fragment links (`/s#…`) remain the default. |

#### M6.4: AI writing assistant

| Work | Size | Exit criteria |
| --- | --- | --- |
| `AiExtension` in the library: slash items (continue writing, summarize, outline, table from a description), floating items (improve, shorten, fix grammar, translate, change tone), toolbar menu | M | The library stays provider-agnostic: the extension takes an `AiProvider` (`stream(request, abortSignal)` returning text chunks). |
| Server AI endpoint: holds the API key, requires sign-in, enforces per-user rate limits and quotas, streams responses | M | A CI check fails if a provider key or SDK appears in the browser bundle. |
| Suggestion UI: the response streams into a preview block with Accept, Discard and Retry; responses are Markdown converted with `markdownToDoc()` so headings, lists and tables arrive formatted | M | Accept is one undo step; Cancel stops both the stream and the server request. |
| Privacy controls: only the selection (or the current document, when the action needs it) is sent; every AI action is labeled; the provider is configured not to retain or train on content | S | Provider data-use terms verified and summarized in the FAQ. |
| Model configuration on the server, per action (a fast model for rewrites, a stronger one for long generation) | S | Models can change without a client release. |

#### M6.5: Real-time collaboration

| Work | Size | Exit criteria |
| --- | --- | --- |
| Yjs sync server (Hocuspocus) with token auth from M6.1 and persistence to the database | L | A server restart loses no edits. |
| `CollaborationExtension` with `ySyncPlugin`, `yUndoPlugin` and `yCursorPlugin`, replacing `HistoryExtension` for shared documents | L | Undo reverts only your own edits. `EditorService` undo, redo and `canUndo` go through one seam so both history modes work. |
| Collaborative documents load from the Yjs document instead of JSON; a JSON snapshot is still saved for the library, search, export and version history | M | Snapshot and live document stay consistent (tested). |
| Sharing with roles (viewer, editor; commenter later), invite by email or link, revoke access | M | Revoking access disconnects that user's live session. |
| Presence: avatars in the top bar, live cursors and selections | M | |
| Schema-change policy for shared documents: additive changes only, or a server-side transform | S | Documented with the versioning rules in [section 8](#8-library-productization-inkframe-uieditor). |
| Page setup (M3.5) in shared documents | S | A layout change on one client reaches every client. y-prosemirror syncs the document's content; if it doesn't sync attributes of the `doc` node, page setup syncs through a `Y.Map` next to the document (verify first). |
| Concurrency test suite: two or more clients, concurrent edits in text, lists, tables and code blocks, offline merge | L | All clients converge; node views (callout, code block, table) stay correct under remote changes. |

### M7: Block mode (Notion-style writing)

**Goal:** a second writing style over the same documents. Block mode is block-first and slash-first with no toolbar; Document mode stays the classic page. Users choose per document and set a default in Settings.

**Rules for every M7 feature:**

1. **One document format.** Switching modes never converts or loses content. The document JSON is identical in both modes (tested).
2. **Every block works in both modes.** Toggles, page links and columns also appear and stay editable in Document mode (through the toolbar's Insert menu); only the interaction style differs.
3. **Built as library extensions,** not app code: `BlockHandlesExtension`, `ToggleExtension`, `PageLinkExtension`, `ColumnsExtension`, grouped as a `BLOCK_MODE_EXTENSIONS` preset, plus a `mode` input on `<ink-editor>`.
4. **Keyboard-first and touch-ready.** Everything the hover handles do is also reachable from the keyboard and by tapping on touch screens, which have no hover.
5. **No databases.** See D16.

**Sequence:** M7.1 → M7.2 → M7.3. M7.4 (columns) is optional and last.

#### M7.1: Mode switch and block canvas

| Work | Size | Exit criteria |
| --- | --- | --- |
| `mode: 'document' \| 'block'` stored per document (`StoredDoc.meta.mode`, default `document`) and a default in Settings | S | Switching modes back and forth leaves the document JSON unchanged (test). |
| Mode toggle in the top bar `⋯` menu and the status bar | S | |
| Block canvas: no toolbar, Pageless layout (M3.5), "Type / for commands" on the active empty line | S | Floating menu and slash menu cover all formatting the toolbar offers. |
| "Turn into" items in the slash menu (paragraph, headings, lists, quote, callout, code, toggle) | S | Turning a block into another type keeps its text. |

#### M7.2: Block handles, block menu and drag and drop

| Work | Size | Exit criteria |
| --- | --- | --- |
| Plugin that tracks the hovered or focused block and shows **+** (insert below, opens the slash menu) and **⋮⋮** (block menu) | M | Handles never shift text or steal focus; they appear on tap on touch screens. |
| Block menu: Turn into, Duplicate, Delete, Move up and down, Color; opens from **⋮⋮** or `Mod-/` | M | Every action is one undo step and works from the keyboard. |
| Drag and drop with a drop-indicator line; works for top-level blocks and list items | L | Dragging inside and out of lists, past tables and code blocks never produces invalid content; long-press drag on touch screens. |
| Keyboard move: `Mod-Shift-↑` / `Mod-Shift-↓` | S | Available in both modes. |
| Multi-block selection: drag across blocks to select, then move, delete or turn into together | M | |

#### M7.3: Toggles, page icon and cover, sub-pages

| Work | Size | Exit criteria |
| --- | --- | --- |
| `toggle` block (summary line plus collapsible content, `> ` input rule at the start of a line in Block mode) | M | HTML export uses `<details>`/`<summary>`; Markdown export writes the same as inline HTML; both round-trip (tests). |
| Page icon (emoji) and cover (image or gradient) in `StoredDoc.meta` | S | Shown in the top bar, library cards, page tree and reader. |
| Sub-pages: `parentId` on documents, a `page_link` block that shows the child's live title and icon | M | Creating a page inside a page works from the slash menu ("Page") and from the page tree. |
| Sidebar page tree (expand, collapse, drag to re-parent) and breadcrumbs in the top bar | M | Deleting a page with children asks whether to delete them or move them up a level. |
| `[[` input rule to link an existing page | S | |
| Sharing rule for sub-pages | S | A share link contains only that page; the share dialog says so. Child page links in shared copies render as plain titles. |

#### M7.4: Columns (optional)

| Work | Size | Exit criteria |
| --- | --- | --- |
| `columns` and `column` blocks (2–4 columns), created by dragging a block beside another or from the slash menu; adjustable widths | L | Columns survive JSON and HTML round trips; they stack on screens under 768px. |
| Export mapping | S | HTML uses a flex wrapper. Markdown writes the columns one after another and the export notes that the layout is lost. |

**Out of scope for M7:** databases and their views, formulas, relations, synced blocks. Revisit only with clear user demand.

---

## 6. Architecture

### 6.1 Layers

```
┌───────────────────────────────────────────────────────────────┐
│ inkframe-app (src/app)                                        │
│  Pages: landing · docs · editor · reader · settings · 404     │
│  DocumentManager (IndexedDB) · share codec · UI kit · layout  │
├───────────────────────────────────────────────────────────────┤
│ @inkframe-ui/editor                                           │
│  <ink-editor>  (src)          – turnkey component             │
│  /toolbar, /extensions        – toolbar, floating & slash     │
│                                 menus, table toolbar, lightbox│
│  /core                        – EditorService, ExtensionManager,│
│                                 schema, plugins, node views,  │
│                                 Markdown/HTML I/O, storage    │
├───────────────────────────────────────────────────────────────┤
│ ProseMirror (model, state, view, tables, history, markdown)   │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 Engineering rules

1. **ProseMirror is the single source of truth.** Angular reads state through signals and dispatches commands; it never keeps a second copy of the document.
2. **Use the live schema.** Commands take node and mark types from `view.state.schema` (`EditorService.schema`), never from the static `schema` export. ProseMirror compares types by identity.
3. **Plugins reach Angular only through `EditorHooks`.** `core/` stays framework-light and unit-testable.
4. **Widgets and node views use the view they are given**, never globals, so several editors can coexist on a page.
5. **Documents are stored as a versioned envelope** `{ schemaVersion, doc }` and always loaded through `migrate()`. Every schema change bumps `SCHEMA_VERSION` and adds a migration with a fixture test.
6. **SSR-safe.** Browser APIs run only in `afterNextRender` or behind environment checks.
7. **Untrusted content is sanitized at the edge.** Pasted and imported HTML goes through DOMPurify and schema parsing; shared documents are rendered through the schema serializer, then DOMPurify; values interpolated into `style` pass `sanitizeCssColor` / `sanitizeCssLength`; links pass `sanitizeHref`.

### 6.3 Routes

| Route | Page | Render mode | Notes |
| --- | --- | --- | --- |
| `/` | Landing | Prerender | Marketing; the hero demo is static markup. |
| `/docs` | Documents library | Prerender | Search, templates, grid and list views. |
| `/doc/:id` | Editor | Client | Unknown ids create a new document. |
| `/editor` | Redirect | — | Redirects to `/docs`. |
| `/s#<payload>` | Reader | Client | Share links; the payload never reaches the server. |
| `/s/:hash` | Reader | Client | Older share links and local document ids. |
| `/settings` | Settings | Prerender | Theme, app install and offline status, data management. |
| `/new` | Redirect | Client | Creates a document and opens it; the installed app's "New document" shortcut. |
| `**` | 404 | Client | |

### 6.4 Data and storage

| Store | Contents | Key |
| --- | --- | --- |
| IndexedDB `inkframe_storage` → `documents` | Document envelopes and the documents index | `inkframe_doc_<id>`, `inkframe_docs_index` |
| IndexedDB `inkframe_storage` → `documents` (M2) | Version history: a list of version metadata per document, and one record per version's content | `inkframe_versions_<docId>`, `inkframe_version_<versionId>` |
| IndexedDB `inkframe_storage` → `images` | Image blobs with metadata | `img_<timestamp>_<random>`, referenced as `ink-idb:<id>` |
| localStorage | Theme, sidebar state, active document id, default page setup, ruler and zoom preferences (M3.5); fallback store when IndexedDB is unavailable | `inkframe-theme`, `inkframe_active_doc_id`, … |
| Cache Storage (M3) | The app itself, cached by the service worker. No documents. | `ngsw:/:…` |

**Planned document change (M3.5):** the `doc` node gains a `page` attribute. It is `null` for every document saved before M3.5, which means Pageless with the default margins:

```ts
page: {
  layout: 'pages' | 'pageless';
  paper: 'a3' | 'a4' | 'a5' | 'letter' | 'legal'; // or a size the host app adds; unknown sizes use A4
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number }; // mm, Pages layout
  sideMargins: { left: number; right: number }; // share of the canvas width (0–0.4), Pageless layout
  color: string | null; // a PAGE_COLORS name, never a CSS value
  printColor: boolean;
} | null
```

Together with the new `page_break` block, this takes `SCHEMA_VERSION` from 4 to 5 with a no-op migration. The writing mode (M7) stays in `StoredDoc.meta` because it is a view setting; page setup changes what prints and exports, so it lives in the document (D17).

**Planned envelope and index changes (M7):** `StoredDoc` gains an optional `meta` object (`mode`, `icon`, `cover`); documents without it open in Document mode, so no migration is needed. The documents index (`DocMeta`) gains `parentId` and `icon` for the page tree. The new block types (`toggle`, `page_link`, `columns`, `column`) are additive, but `SCHEMA_VERSION` still goes up (from 5 to 6; versions 2 to 5 are taken, 5 by M3.5) with a no-op migration: older app versions then refuse such documents with a clear "made with a newer version" message instead of failing on unknown blocks.

**Backup format (`.inkframe.json`):** `{ format: "inkframe-backup", version: 1, createdAt, documents: [{ meta, doc, versions: [{ meta, doc }] }], images: [{ id, name, type, size, createdAt, data }] }`. `doc` is the stored envelope (migrated on load); `data` is a `data:` URL. Only images that documents or versions show are included.

**Share payload format:** `c_` + base64url(deflate-raw(JSON)) when `CompressionStream` is available, otherwise `u_` + base64url(JSON). The JSON is `{ t: title, v: schemaVersion, d: doc }`; images are inlined as compressed JPEG data URLs.

### 6.5 Extension system

An `EditorExtension` can contribute nodes, marks, input rules, keymaps, plugins, node views, toolbar items, slash items and floating-menu items. `ExtensionManager` builds the schema and plugins from the active list. The `<ink-editor [extensions]>` input can change at runtime; if the open document needs a removed extension, the previous set is kept so no content is lost. `DEFAULT_EXTENSIONS` (alias `StarterKit`) is the full set; see the [appendix](#12-appendix-shortcuts-and-extensions).

### 6.6 Optional cloud architecture (M6)

```
Browser (Inkframe app)                          Backend (signed-in users only)
┌───────────────────────────────┐              ┌────────────────────────────────────┐
│ Editor ─► LocalDocumentStore  │   HTTPS      │ API: auth · documents · images     │
│           (IndexedDB, primary)│◄────────────►│      · public links · AI proxy     │
│ SyncEngine · ImageStore cache │              ├────────────────────────────────────┤
│ AuthService (signals)         │              │ Postgres │ Object storage │ AI     │
│ AiProvider ───────────────────┼──── SSE ────►│ (RLS)    │ (private)      │ model  │
│ CollaborationExtension ◄──────┼─ WebSocket ─►│ Yjs sync server (Hocuspocus) ─► DB │
└───────────────────────────────┘              └────────────────────────────────────┘
```

**Interfaces** (the seams that keep the provider swappable):

| Interface | Implementations | Lives in |
| --- | --- | --- |
| `DocumentStore` | `LocalDocumentStore` (today's code), `CloudDocumentStore` | App (`src/app/features/documents`) |
| `ImageStore` | IndexedDB; cloud with a local cache | Library `/core` (`imageStorage` gains a cloud resolver) |
| `AuthService` | The chosen provider's SDK | App |
| `AiProvider` | Server proxy client in the app; library consumers bring their own | Library `/core` (interface), app (implementation) |
| Collaboration provider | Hocuspocus provider | Library extension, wired up in the app |

**Server data model:**

| Table | Key columns | Notes |
| --- | --- | --- |
| `documents` | `id`, `owner_id`, `parent_id` (nullable), `title`, `schema_version`, `meta` (jsonb: mode, icon, cover), `content` (jsonb snapshot), `version` (int), `yjs_state` (bytes, nullable), `updated_at`, `deleted_at` | `version` drives optimistic concurrency. `yjs_state` exists from M6.2 so collaboration needs no data migration later. `parent_id` and `meta` carry M7 sub-pages and page settings. |
| `document_versions` | `id`, `document_id`, `content`, `created_at`, `created_by` | Version history (M2) synced to the server. |
| `document_members` | `document_id`, `user_id`, `role` | Collaboration roles (M6.5). |
| `images` | `id`, `owner_id`, `document_id`, `storage_path`, `size`, `type` | Quotas and cleanup. |
| `public_links` | `id`, `document_id`, `created_at`, `expires_at`, `revoked_at` | M6.3. |
| `ai_usage` | `user_id`, `period`, `request_count`, `token_count` | Quotas only; **never stores prompts or document content.** |

Every table is protected by per-owner (and per-member) access rules enforced in the database, not only in API code.

---

## 7. Design system and UX standards

### 7.1 Direction

Clean and soft: a warm off-white canvas (soft charcoal in dark mode, with a darker sidebar and warm off-white text), white surfaces, hairline borders, very light shadows, generous whitespace, one accent color (teal) reserved for the single primary action per screen. `--ink-accent` fills buttons; accent-colored text and icons use `--ink-accent-text`, because the fill is too dark for text on charcoal. Motion is short (120–200 ms) and respects `prefers-reduced-motion`.

**Source of truth:** `src/styles/tokens.scss` (app) and `projects/inkframe-editor/src/styles/_variables.scss` (library). Tailwind v4 maps the `--ink-*` tokens to utilities in `src/styles/styles.scss`.

| Token group | Light | Dark |
| --- | --- | --- |
| Canvas `--ink-bg` | `#f7f6f3` | `#151515` |
| Surface `--ink-surface` | `#ffffff` | `#1e1e1d` |
| Sidebar `--ink-sidebar` | `#ffffff` | `#111111` |
| Border `--ink-border` | `#e8e6e1` | `#2a2a29` |
| Text `--ink-text` / muted | `#1b1b1f` / `#6b6b73` | `#f0efec` / `#9a9891` |
| Accent `--ink-accent` / soft | `#028380` / `#e0f8f6` | `#028380` / `#0d302f` |
| Accent text `--ink-accent-text` | `#017a78` | `#58aaa6` |

**Typography:** Inter for the UI (14px) and the document body (14px, 1.65 line height, set with `--ink-editor-font-size`; headings, code and captions scale with it in em), JetBrains Mono for code, optional serif body as a document setting. Scale 12 / 13 / 14 / 16 / 20 / 24 / 32 / 48 / 64. **Spacing:** 4px base. **Radius:** 6 / 10 / 16px. **Focus ring:** 3px teal (`--ink-border-focus`, 70% opacity in light, 60% in dark, for 3:1 contrast), never removed.

### 7.2 Editor layout

| Element | Spec |
| --- | --- |
| Top bar | One row, 56px (48px on mobile): back/logo, inline-editable title, save status, view switch, Share (primary), `⋯` menu. |
| Toolbar | Sticky 44px strip, no enclosing card. Groups: history · block type · inline marks · lists · insert. Active state uses `--ink-accent-soft`. Under 768px it sits below the page, above the on-screen keyboard; the status bar hides while typing, and the selection menu is not shown (the toolbar has the same formatting, and phones show their own menu over a selection). |
| Canvas (M3.5) | **Pageless** (the default): the whole canvas takes the page surface color (`--ink-surface`), with no sheet border. Side margins come from the ruler, 10% each side by default and never under 32px. **Pages:** an `--ink-bg` canvas holding one `--ink-surface` sheet at the paper's real width, with the page margins as padding; it scrolls sideways when the sheet is wider than the canvas. The sheet's edge is a shadow, not a border, so the text column is exactly as wide as on paper. Never wrapped in another bordered box. A page color replaces the surface color. The editor, the reader and version previews share these styles (`.ink-canvas`, `.ink-sheet`, `.ink-sheet-body`). |
| Ruler (M3.5) | A 24px strip between the toolbar and the canvas. It stays in place while the page scrolls down and moves with it sideways. Shaded margins with drag handles (44px hit areas on touch screens); cm for A-series paper, inches for Letter and Legal. Hidden under 768px; Show ruler in Settings → Editor. |
| Status bar | 28px, muted: words, characters, reading time; a layout button ("Pageless", "A4 · Portrait") that opens Page setup, hidden on touch screens because the bar has no room for a 44px target; zoom for Pages layout (M3.5). |
| Panels | Documents and outline as 360px drawers with a soft scrim. Under 640px, menus (toolbar, Export) and the Share popover open as bottom sheets above the keyboard; the documents drawer stays a side drawer, since it is the app's navigation. Version history is a 340px panel beside the page with no scrim, because the page shows the version being previewed; under 768px it covers the page and gives way to the preview. |
| Block mode (M7) | No toolbar strip. Optional cover (200px desktop, 120px mobile) and a 64px page icon above the title. Pageless layout (M3.5); M7.1 sets its default margins and whether the ruler shows. Block handles sit in the left margin (outside the text column) at 24px, muted until hovered. The sidebar shows the page tree instead of a flat document list. |

### 7.3 States every screen must cover

| State | Standard |
| --- | --- |
| Loading | Skeletons, not spinners, for app boot, document list (6 cards) and editor sheet. Buttons show inline spinners during export and share. |
| Empty | Icon, one-line title, one action (for example "Your first idea starts here" with New document). Search shows "No matches for 'x'" with Clear search. |
| Error | Inline banners with a recovery action (storage full → Export backup; broken share link → friendly page with "Go to editor"). |
| Feedback | Toasts at bottom center, max 3, auto-dismiss after 3 seconds. Destructive actions use the confirm dialog with the danger color only on the confirm button. |
| Disabled | 40% opacity, `not-allowed` cursor, tooltip explaining why where useful. |

### 7.4 Mobile (< 768px)

Full-bleed sheet with 16–20px padding and a 16px minimum input font size (prevents iOS zoom). One horizontally scrolling toolbar row pinned above the keyboard via `visualViewport`. `100dvh` and `env(safe-area-inset-*)`. Landing collapses to one column with full-width buttons and a sheet menu. The header keeps the sidebar button, the title and the main actions; the theme toggle moves into the sidebar. On touch screens (`pointer: coarse`) every control is at least 44px. Page setup (M3.5): no ruler, and Pages documents reflow to the screen width like Pageless ones; printing still uses the document's paper size and margins.

### 7.5 Accessibility

WCAG 2.1 AA in both themes. Every icon-only button has an `aria-label` and toggles use `aria-pressed`. The toolbar is `role="toolbar"`; the slash menu is `role="listbox"` with `aria-activedescendant` on the editor. Dialogs trap focus and close on Esc. Menus never steal focus from the editor. Checklist state is not conveyed by color alone.

---

## 8. Library productization (`@inkframe-ui/editor`)

| Area | Plan |
| --- | --- |
| Entry points | `@inkframe-ui/editor` (component), `/core`, `/toolbar`, `/ui`, `/styles`. |
| Dependencies | Angular, CDK and Material as peer dependencies; ProseMirror packages, `markdown-it`, DOMPurify and Prism as dependencies. |
| Public API for 1.0 | `<ink-editor>` inputs (`initialDoc`, `editable`, `extensions`, `showToolbar`, `showStatusBar`, `mobileToolbar`, `debounceMs`) and outputs (`changed`, `historyRequested`); methods `loadDoc`, `flush`, `getJSON`, `getHtml`, `getMarkdown`, `loadMarkdown`, `loadHtml`; `EditorService` commands and signals; `createExtension`, `DEFAULT_EXTENSIONS`, individual extensions; I/O helpers and `sanitizeHtml`; `VisualViewportTracker` for layouts that stay above the on-screen keyboard. |
| Deprecations before 1.0 | `buildPlugins`, `SLASH_ITEMS` and direct use of the static `schema` in commands. Mark `@deprecated`; remove in 2.0. |
| Page setup (M3.5) | Part of 1.0. `PageSetupExtension` (commands, the `page_break` block, sheet and canvas styles); `<ink-ruler>` in `/ui`; `PAPER_SIZES` and `PAGE_COLORS` as data that host apps can extend; the `EditorService.pageSetup` signal and `setPageSetup()`; `PageSetupDialog` in `/ui`; on `<ink-editor>`, a two-way `defaultPageSetup` input, an `openPageSetup()` method and a `showRuler` input. `docToHtmlDocument` writes the document's `@page` rules. The `page` attribute itself lives on `doc`, so documents load with or without the extension. |
| Block mode (M7) | Ships as a minor release: `BlockHandlesExtension`, `ToggleExtension`, `PageLinkExtension`, `ColumnsExtension`, the `BLOCK_MODE_EXTENSIONS` preset and a `mode` input on `<ink-editor>`. `PageLinkExtension` takes a resolver for titles, icons and navigation, so host apps plug in their own page model. |
| Versioning | Semver. Schema changes are minor releases with migrations; removing a node or mark is a major release. Keep a `CHANGELOG.md`. |
| Documentation | README with a 5-minute setup (install, styles, `<ink-editor>`), an extension authoring guide, the shortcut and extension reference, and a live playground page in the app (reuse the existing preset demo). |
| Quality gates | Library builds independently; no imports from `src/app`; bundle size tracked per entry point; a consumer smoke test app in CI installs the packed tarball. |
| Release | `npm run publish:lib:dry`, then `npm run publish:lib` from CI on a tag. |

---

## 9. Quality, security and release

### 9.1 Test strategy

| Layer | What | Tool |
| --- | --- | --- |
| Core | Schema, commands, input rules, migrations, Markdown and HTML round trips, sanitization | Vitest (exists) |
| Services | `EditorService` with the extension-built schema, `DocumentManager`, share codec | Vitest (exists) |
| Components | `<ink-editor>` change emission, toolbar states, reader rendering | Angular test runner (M0) |
| End to end | Typing, shortcuts, paste fixtures, slash and floating menus, tables, IME, share link round trip, offline start | Playwright (M1–M3) |
| Accessibility | Axe on every page, keyboard-only run-through | Playwright with axe-core (M4) |

### 9.2 Performance budgets

| Metric | Budget |
| --- | --- |
| Initial app bundle (transfer) | ≤ 150 kB; the editor stays lazy-loaded on `/doc/:id` |
| Typing latency | < 16 ms per keystroke on a 5,000-word document |
| Editor ready (warm cache) | < 1 s on a mid-range phone |
| Landing Lighthouse performance | ≥ 90 |

### 9.3 Security model

| Threat | Defense |
| --- | --- |
| Scripts in pasted or imported HTML | DOMPurify, then ProseMirror schema parsing keeps only known nodes and marks. |
| Malicious shared documents | Rendered through the schema serializer, then DOMPurify; no raw HTML from the payload is trusted. |
| CSS injection through attributes (tracking pixels) | `sanitizeCssColor` / `sanitizeCssLength` on colors, widths and heights. |
| Page setup values in shared documents (M3.5) | Layout, paper and orientation are checked against fixed lists; margins are clamped numbers; page color is a palette name, never a CSS value. Anything else falls back to the default. |
| `javascript:` links, tab-nabbing | `sanitizeHref` allow-list; links get `rel="noopener noreferrer nofollow"`. |
| Server exposure of shared content | Share payload lives in the URL fragment, which browsers never send. |
| Third-party requests | Self-hosted fonts and icons (B1). External images in documents are user-chosen; the editor loads them with `referrerpolicy="no-referrer"`, and the reader should too (add in M0). |
| Content Security Policy | Add a CSP at deploy time once fonts are self-hosted (no inline scripts; images allow `data:`, `blob:`, `https:`). |
| **M6:** account takeover, session theft | Provider-managed auth, short-lived tokens, HTTP-only cookies where the provider supports them. |
| **M6:** reading other users' data | Row-level access rules in the database on every table; API-level tests that attempt cross-user access. |
| **M6:** leaked AI keys, AI cost abuse | Keys only on the server; per-user rate limits and quotas; CI check on the client bundle. |
| **M6:** data at rest and in transit | TLS everywhere; provider encryption at rest; private buckets with signed URLs. |
| **M6:** right to be forgotten | Account deletion removes documents, versions, images, links, memberships and usage rows. |

A security review of the backend, the access rules and the AI endpoint is required before M6 goes to production.

### 9.4 Definition of done (every feature)

- [ ] Works in light and dark themes, desktop and mobile, with keyboard only.
- [ ] Loading, empty, error and disabled states designed and implemented.
- [ ] Survives a Markdown and HTML round trip, or the export mapping is documented.
- [ ] Unit tests for logic; component or end-to-end test for interaction.
- [ ] No new third-party network requests.
- [ ] Library and app build cleanly; bundle budget respected.
- [ ] Any landing-page or docs claim updated in the same change.

### 9.5 Release checklist

- [ ] All launch blockers in [section 4.2](#42-launch-blockers-must-fix-before-public-launch) closed.
- [ ] `security.allowedHosts` (or `NG_ALLOWED_HOSTS`) set for production domains.
- [ ] CSP and caching headers configured; service worker versioning verified.
- [ ] Backup, restore and migration tested with documents from the previous release.
- [ ] Library tarball installed into a clean Angular app and smoke-tested.

---

## 10. Success metrics

Inkframe promises zero tracking, so **the app collects no analytics**. Measure through channels that don't touch users' documents or behavior:

| Goal | Metric | Source |
| --- | --- | --- |
| Adoption (app) | Landing page visits and installs | Server request counts only (no cookies, no client analytics), PWA install counts from store listings if published |
| Adoption (library) | Weekly npm downloads, GitHub stars, dependents | npm, GitHub |
| Quality | Open bug count by severity, crash reports users choose to send | GitHub issues, an in-app "Report a problem" link that opens a prefilled issue |
| Satisfaction | Voluntary feedback, review sentiment | GitHub discussions, feedback form |
| Launch readiness | Blockers closed, axe issues, Lighthouse scores, test count | CI |
| Cloud adoption (M6) | Accounts, synced documents, collaboration sessions, AI requests against quota | Aggregate counts from the server database. No client-side analytics and no inspection of document content. |

---

## 11. Decisions and risks

### 11.1 Decision log

| # | Decision | Status |
| --- | --- | --- |
| D1 | Name **Inkframe**; package `@inkframe-ui/editor`; selector `<ink-editor>` | Final |
| D2 | Position as a **full WYSIWYG document editor**; Markdown is an import/export format, never the storage format | Final (this plan) |
| D3 | Local-first storage in IndexedDB; core features never need a backend. Cloud is an optional layer (M6). | Final |
| D4 | Share links carry the document in the URL fragment | Final |
| D5 | Public cloud links: opt-in, revocable, synced documents only (M6.3). Fragment links stay the default. | Final |
| D6 | Real-time collaboration uses Yjs with `y-prosemirror` (M6.5), not at launch. Store `yjs_state` from M6.2 onward; keep the undo seam isolated. | Final |
| D7 | Angular 22, standalone components, signals, SSR with prerendered marketing pages | Final |
| D8 | UI: SCSS tokens + Tailwind v4 + Angular Material components | Final |
| D9 | No analytics in the app (server-side aggregate counts for M6 features only) | Final |
| D10 | Backend provider for M6 | **Open.** Recommended: Supabase, plus Hocuspocus for collaboration. |
| D11 | An account is never required to use the editor | Final |
| D12 | AI calls go through a server proxy; the library ships a provider-agnostic `AiProvider` interface; AI is signed-in only | Final |
| D13 | Sync conflicts never silently overwrite; the losing edit becomes a conflict copy | Final |
| D14 | Block mode and Document mode edit the same document format; the mode is a per-document view setting | Final |
| D15 | The feature is called **Block mode** in the product, docs and marketing, never "Notion mode" | Final |
| D16 | No databases (table, board or calendar views with properties) | Final; revisit only with strong demand |
| D17 | Page setup (layout, paper, orientation, margins, page color) is stored in the document, as a `page` attribute on the `doc` node, so share links, backups and version history carry it. The writing mode (D14) stays a view setting in `StoredDoc.meta`. | Final (this plan) |
| D18 | Pageless means the full canvas; the ruler sets its margins. No fixed-width presets. | Final |
| D19 | Pages layout shows real pages on screen, split with the same rules as printing (M3.5 step 6). The document never stores where pages end; spacers on screen do. Headers, footers and printed page numbers only with clear demand. | Changed 2026-10-18 (was: one long sheet, pages only in print) |
| D20 | Page colors come from a fixed palette with a light and a dark value each; print and exports use the light value. | Final |

### 11.2 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Users lose documents when the browser clears site data | High | Backup and restore (M2), periodic "export a backup" reminder, `navigator.storage.persist()` request. |
| Privacy claims contradicted by third-party requests | High | B1 plus a CI check that fails on third-party URLs in `index.html` and styles. |
| Share links too long for some apps | Medium | Size warning in the share dialog; image compression; optional cloud links later. |
| Schema changes break saved documents | High | Versioned envelope, mandatory migrations with fixture tests. |
| WYSIWYG formats that Markdown can't express | Medium | Inline HTML fallback (already used for underline, color, small, sub, sup) and a documented mapping. |
| Scope creep toward a Google Docs clone | Medium | Hold the P0/P1/P2 lines; ship M1–M4 before any P2 work. |
| IME and mobile editing quirks | Medium | Menus guard on composition; Playwright IME tests; real-device testing in M3. |
| Cloud features undermine the privacy positioning | High | Account optional forever (D11), per-document sync choice, clear labels, signed-out experience unchanged. |
| Collaboration takes far more work than expected | High | Ship sync (M6.2) and AI (M6.4) first and collaboration last; store `yjs_state` early so no data migration is needed. |
| Server data breach | High | Database-enforced access rules, least-privilege service keys, a security review before launch, no AI content stored. |
| Running costs (storage, AI tokens, sync server) | Medium | Per-user quotas from day one; free-tier limits; consider a paid plan for heavy cloud and AI use. |
| AI output is wrong or unwanted | Medium | Suggestions always need an explicit Accept and are one undo step. |
| Dependence on one backend or AI provider | Medium | `DocumentStore`, `ImageStore`, `AuthService` and `AiProvider` interfaces; models configured server-side. |
| Block mode grows into a Notion clone | High | D16 keeps databases out; columns are optional (M7.4); ship M7.1–M7.3 first. |
| Drag-and-drop edge cases (lists, tables, nested blocks) | Medium | Drop targets limited to valid positions; property-based tests that drag random blocks and check the document stays valid. |
| Touch screens have no hover | Medium | Tap shows handles, long-press drags, every action also in the block menu and the keyboard. |
| Markdown cannot express toggles, page links or columns | Medium | Inline HTML for toggles, links for page links, stacked columns with a note; documented export mapping. |
| Two modes confuse new users | Low | One default (Document mode); Block mode introduced by a template and an onboarding tip, not forced. |
| Screen and printout drift apart in Pages layout (font loading, differences between browsers' print engines) | Medium | The same font files and font size on screen and in the print frame; explicit `@page` sizes; a print-preview check in Chrome, Firefox and Safari before each release. |
| Pages on screen drift from the printed pages | Medium | One set of rules for both (the print CSS and the pagination function); a test that compares each printed page's first word with the screen. |
| Pagination slows typing in long documents | Medium | Measure a frame after a change, and only around page ends; skip while composing text; check against the 16 ms typing budget. |
| People expect headers, footers and printed page numbers | Low | Not planned (D19); the landing page does not promise them. |
| Full-width lines are hard to read on wide screens | Low | Pageless starts with 10% margins on each side; the ruler changes them. |
| Zoom breaks caret placement, selection or menu positions | Medium | Zoom ships last (M3.5 step 5), with tests at 50, 75, 125 and 150% in all three browsers. Chrome passes. Safari's `zoom` is WebKit's older implementation and may report positions differently; check it before launch. |

---

## 12. Appendix: shortcuts and extensions

### 12.1 Keyboard shortcuts (`Mod` = Ctrl on Windows/Linux, ⌘ on macOS)

| Action | Shortcut | Markdown input rule |
| --- | --- | --- |
| Bold / italic / underline | `Mod-B` / `Mod-I` / `Mod-U` | `**text**` / `_text_` |
| Strikethrough | `Mod-Shift-S` | `~~text~~` |
| Inline code | `Mod-E` or `Mod-Shift-M` | `` `text` `` |
| Subscript / superscript | `Mod-Shift-,` / `Mod-Shift-.` | `~text~` / `^text^` |
| Small text | `Mod-Alt-7` | |
| Clear formatting | `Mod-\` | |
| Paragraph / heading 1–6 | `Mod-Alt-0` / `Mod-Alt-1`…`6` | `# ` … `###### ` |
| Bullet / numbered / task list | `Mod-Shift-8` / `7` / `6` | `- ` / `1. ` / `[ ] ` |
| Quote / code block | | `> ` / ```` ```lang ```` |
| Hard break | `Shift-Enter` | |
| Undo / redo | `Mod-Z` / `Mod-Y` or `Mod-Shift-Z` | |
| Highlight | `Mod-Alt-H` | `==text==` (import only) |
| Align left / center / right / justify | `Mod-Shift-L` / `E` / `R` / `J` | |
| Indent / outdent list item | `Tab` / `Shift-Tab` | |
| Next / previous table cell | `Tab` / `Shift-Tab` | |
| Link | `Mod-K` | |
| Find / replace | `Mod-F` / `Mod-H` (macOS: `Mod-Shift-H`) | |
| Print or save as PDF | `Mod-P` (app) | |
| Page break | `Mod-Enter` (in task lists it checks the task; in code blocks it leaves the block) | |
| Next / previous match | `Enter` / `Shift-Enter` in the find field, or `Mod-G` / `Mod-Shift-G` | |

### 12.2 Built-in extensions (`DEFAULT_EXTENSIONS`)

| Group | Extensions |
| --- | --- |
| Essentials | `doc`, `paragraph`, `text`, `hard_break`, `history` |
| Inline formatting | `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`, `textColor`, `small`, `highlight`, `clear_formatting` |
| Blocks | `heading`, `blockquote`, `code_block`, `text_align`, `divider` |
| Lists | `bullet_list`, `ordered_list`, `task_list` |
| Rich inserts | `table`, `callout`, `link`, `image` |
| Editing aids | `search` (find and replace), `placeholder` (`createPlaceholderExtension(text)` for other text), `paste_cleanup` |
| Page setup (M3.5) | `page_setup` (commands, the `page_break` block, `Mod-Enter`, the slash item; the `page` attribute lives on `doc`; the ruler and dialog are in `/ui`) |
| Block mode (M7, planned) | `block_handles`, `toggle`, `page_link`, `columns` (preset `BLOCK_MODE_EXTENSIONS`) |
