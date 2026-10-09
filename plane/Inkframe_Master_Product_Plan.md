# Inkframe: Master Product & Full App Implementation Plan

**Version:** 3.0 (Unified Product & Architectural Blueprint)  
**Target:** Angular 22+, ProseMirror, Standalone Library (`@inkframe-ui/editor`) & Complete Web Application (`inkframe-app`)  
**Status:** Approved Architecture & Phased Execution Plan  

---

## 1. Executive Summary & Project Assessment

Inkframe consists of two distinct yet synergistic layers:
1. **The Core Engine & Library (`projects/inkframe-editor`):** An isolated, npm-publishable rich-text editor library (`@inkframe-ui/editor`) featuring ProseMirror, Angular signals, modular sub-entry points (`/core`, `/toolbar`, `/extensions`), custom NodeViews (task lists, tables, callouts, code blocks, images), and theme tokens.
2. **The Full Consumer Application (`src/app`):** An offline-first, privacy-respecting writing application with persistent IndexedDB storage, version history, document management, link sharing, and landing pages.

### Audit of Current Implementation vs. UI Redesign Plan (`plane/Inkframe UI Redesign Plan.md`)

| Area | Current Implementation | Redesign Requirement | Gap / Refactoring Needed |
| :--- | :--- | :--- | :--- |
| **Visual Hierarchy & Borders** | Outer border + viewport padding + inner card border + toolbar borders. Multiple nested cards create visual clutter. | Single surface sheet (`--surface`), clean canvas (`--bg`), hairline 1px borders, subtle 4px–16px shadows. | Remove wrapper borders; style the editor canvas as an unconstrained sheet with natural elevation. |
| **Header Bar** | Crowded 2-row header: Back button, Logo, Title, Doc Switcher, Editor/Preview Tabs, Stats Pill, New, Save, Share, Theme, Kebab. | Sleek single-row 56px top bar: Back/Logo, inline-editable doc title, quiet autosave indicator ("Saving..." / "Saved ✓"), View Tabs, Share CTA, and `⋯` kebab. | Eliminate manual Save button (autosave is active); move word counts to bottom status bar; enable inline title editing. |
| **Toolbar** | Dense toolbar with ~25 visible buttons and nested containers. | Sticky 44px toolbar strip on canvas background with clean dividers and grouped popovers. | Streamline button clusters; elevate active states with `--accent-soft` and clean hairline separators. |
| **Status Bar** | Floating pill in header (`373w · 2448c`). | 28px bottom status bar: words, characters, reading time, and canvas width controls. | Implement dedicated bottom status bar; remove stats pill from header. |
| **Route Architecture** | Only `/` (landing) and `/editor` (editor). Shared links overload `/editor?share=...`. | Dedicated routes: `/`, `/docs`, `/doc/:id`, `/s/:hash`, `/settings`, `**` (404). | Restructure `app.routes.ts` with lazy-loaded route components. |
| **Documents Library** | Right-hand slide-out drawer only. | Dedicated `/docs` library page with search, sort, templates, skeleton loading, and empty states. | Create `/docs` page; retain drawer as quick switcher. |
| **Shared Reader View** | Embedded conditionally inside `editor-page.component.html` with hidden controls. | Clean, dedicated `/s/:hash` reader route with reading progress, theme toggle, and "Copy to my editor" action. | Extract into standalone `SharedViewComponent`. |
| **Component States** | Basic spinners. | Full state coverage: Skeletons, empty states, error banners, toast notifications. | Build shared UI kit (`Skeleton`, `EmptyState`, `ToastService`, `ConfirmDialog`). |
| **Mobile Experience** | Desktop layout squished into mobile viewport. | Pinned mobile keyboard toolbar via `visualViewport`, full-bleed sheet, 44px touch targets. | Implement responsive mobile toolbar and bottom-sheet drawers. |

---

## 2. Global Design System & Token Architecture

The design system follows a **clean, soft, obsidian & warm-light** aesthetic with strict tokenization.

### 2.1 Color Tokens (`tokens.scss`)

```scss
:root {
  /* Canvas & Surfaces */
  --ink-bg: #f7f6f3;               /* Warm off-white canvas */
  --ink-surface: #ffffff;          /* Clean white cards and sheets */
  --ink-surface-2: #f1f0ec;        /* Input backgrounds, hover states */
  --ink-surface-subtle: #eae8e3;   /* Secondary backgrounds */

  /* Hairline Borders */
  --ink-border: #e8e6e1;           /* 1px subtle boundary */
  --ink-border-strong: #d6d3cc;    /* Hover / active boundary */
  --ink-border-focus: rgba(124, 58, 237, 0.4);

  /* Typography */
  --ink-text: #1b1b1f;             /* Primary text */
  --ink-text-muted: #6b6b73;       /* Captions, counts, placeholders */
  --ink-text-heading: #111113;

  /* Accent & Actions (Curated Violet) */
  --ink-accent: #7c3aed;           /* Primary brand action */
  --ink-accent-hover: #6d28d9;
  --ink-accent-soft: #f3eeff;      /* Active button background */
  --ink-accent-text: #6d28d9;

  /* Status Colors */
  --ink-danger: #dc2626;
  --ink-danger-soft: #fef2f2;
  --ink-success: #16a34a;
  --ink-success-soft: #f0fdf4;

  /* Micro-Elevation Shadows */
  --ink-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --ink-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06);
  --ink-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.10);
  --ink-shadow-page: 0 1px 4px rgba(0, 0, 0, 0.05);

  /* Geometry & Motion */
  --ink-radius-sm: 6px;
  --ink-radius-md: 10px;
  --ink-radius-lg: 16px;
  --ink-transition-fast: 120ms ease-out;
  --ink-transition-base: 180ms ease-out;
}

:root[data-theme="dark"],
body[data-theme="dark"],
.theme-dark {
  --ink-bg: #0e0e10;               /* Deep obsidian canvas */
  --ink-surface: #17171a;          /* Surface sheet */
  --ink-surface-2: #1f1f23;        /* Inputs, hover */
  --ink-surface-subtle: #26262c;

  --ink-border: #26262b;
  --ink-border-strong: #34343a;
  --ink-border-focus: rgba(139, 92, 246, 0.45);

  --ink-text: #ededef;
  --ink-text-muted: #9a9aa3;
  --ink-text-heading: #ffffff;

  --ink-accent: #8b5cf6;
  --ink-accent-hover: #7c3aed;
  --ink-accent-soft: #241b3d;
  --ink-accent-text: #c4b5fd;

  --ink-danger: #ef4444;
  --ink-danger-soft: rgba(239, 68, 68, 0.12);
  --ink-success: #22c55e;
  --ink-success-soft: rgba(34, 197, 94, 0.12);

  --ink-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --ink-shadow-md: 0 6px 20px rgba(0, 0, 0, 0.4);
  --ink-shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.6);
  --ink-shadow-page: 0 2px 12px rgba(0, 0, 0, 0.45);
}
```

---

## 3. Architecture & Routing Matrix

```
                          ┌──────────────────────────┐
                          │   Inkframe App Shell     │
                          │   Theme, Toasts, Modals  │
                          └─────────────┬────────────┘
                                        │
      ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
      ▼                 ▼               ▼               ▼                 ▼
   Route: /        Route: /docs    Route: /doc/:id   Route: /s/:hash   Route: /settings
 Landing Page    Documents Grid    Main Writing      Pure Shared View   Preferences &
 Features, Demo  Search & Sort     Autosave & Tools  Sanitized Reader   JSON Backup
```

### Route Breakdown

| Route | Component | Purpose | Guards / Behaviors |
| :--- | :--- | :--- | :--- |
| `/` | `LandingComponent` | Marketing, product explanation, feature showcase, interactive demo. | Redirects to `/doc/:id` on "Open Editor". |
| `/docs` | `DocsComponent` | Full document manager: Grid/List view, search, sorting, tag filters, templates, batch deletion. | Direct access to all local IndexedDB documents. |
| `/doc/:id` | `EditorPageComponent` | Primary distraction-free writing environment. | If `:id` is not found, loads or creates new doc. Auto-syncs document title with route. |
| `/editor` | *Redirector* | Legacy fallback. | Redirects to `/doc/:lastActiveId` or creates new doc. |
| `/s/:hash` | `ReaderComponent` | Pure read-only presentation view. | Decompresses payload, renders sanitized DOM with syntax highlighting, allows "Copy to Editor". |
| `/settings` | `SettingsComponent` | System preferences. | Appearance (Dark/Light/System), default canvas width, font selection, full backup download/import. |
| `**` | `NotFoundComponent` | Friendly 404 page. | Includes quick links to Home or Documents Library. |

---

## 4. Advanced Directory & File Structure (Scalable & Modular)

The project separates the **reusable core editor package** from the **consumer web application**. Every folder has a single responsibility, follows Angular 22 standalone & signals standards, and allows effortless extension of new pages, UI components, or editor capabilities.

```
inkframe-app/
├── projects/
│   └── inkframe-editor/                     <-- Standalone Reusable NPM Library (@inkframe-ui/editor)
│       ├── core/                            <-- Entry Point: @inkframe-ui/editor/core
│       │   ├── io/                          <-- Content Serializers & Parsers
│       │   │   ├── html.ts                  (DOMSerializer / DOMParser with sanitization)
│       │   │   └── markdown.ts              (Markdown serializer & parser)
│       │   ├── node-views/                  <-- Custom ProseMirror Interactive Blocks
│       │   │   ├── callout.node-view.ts     (Alert boxes with icon switcher)
│       │   │   ├── callout-icon.component.ts
│       │   │   ├── code-block.node-view.ts  (Syntax highlighting, line numbers, copy)
│       │   │   ├── image.node-view.ts       (Resizable image with lightbox trigger)
│       │   │   └── task-item.node-view.ts   (Checklist with clickable checkboxes)
│       │   ├── colors.ts                    (21-swatch text/background color palettes)
│       │   ├── editor-hooks.ts              (Decoupled bridge between ProseMirror & UI)
│       │   ├── editor.service.ts            (Reactive ProseMirror state & signal sync)
│       │   ├── highlight.plugin.ts          (Prism.js syntax highlighter)
│       │   ├── image-storage.ts             (IndexedDB local binary storage engine)
│       │   ├── input-rules.ts               (Markdown inline typing rules: [ ], #, ~~)
│       │   ├── link-utils.ts                (URL validation & XSS safety)
│       │   ├── menus.plugin.ts              (Coordinates floating & slash menus)
│       │   ├── migrations.ts                (Schema versioning & backward compatibility)
│       │   ├── plugins.ts                   (History, keymaps, dropcursor, gapcursor)
│       │   ├── schema.ts                    (ProseMirror nodes, marks & attributes)
│       │   ├── slash-items.ts               (Slash command action registry)
│       │   ├── table-ui.plugin.ts           (Interactive table column/row handlers)
│       │   ├── theme.service.ts             (Reactive dark/light signal & DOM toggle)
│       │   ├── index.ts                     (Core public exports)
│       │   └── ng-package.json
│       ├── toolbar/                         <-- Entry Point: @inkframe-ui/editor/toolbar
│       │   ├── toolbar.component.ts         (Grouped formatting bar & dialog triggers)
│       │   ├── toolbar.component.scss
│       │   ├── index.ts
│       │   └── ng-package.json
│       ├── extensions/                      <-- Entry Point: @inkframe-ui/editor/extensions
│       │   ├── floating-menu/
│       │   │   └── floating-menu.component.ts (Selection bubble menu)
│       │   ├── slash-menu/
│       │   │   ├── slash-menu.component.ts  (Notion-style / command palette)
│       │   │   └── slash-items.ts
│       │   ├── table-toolbar/
│       │   │   └── table-toolbar.component.ts (Floating table mutation controls)
│       │   ├── image-lightbox/
│       │   │   └── image-lightbox.component.ts(Full-res image modal preview)
│       │   ├── index.ts
│       │   └── ng-package.json
│       ├── src/                             <-- Main Package Entry: @inkframe-ui/editor
│       │   ├── editor.component.ts          (Turnkey <ink-editor> component)
│       │   ├── editor.service.ts            (Re-exported service & type definitions)
│       │   ├── public-api.ts                (Main package index)
│       │   └── styles/                      <-- SCSS Theme System
│       │       ├── _variables.scss          (Dark & light CSS custom properties)
│       │       ├── _toolbar-menus.scss      (Dropdowns, popovers, toolbars)
│       │       ├── _editor-content.scss     (ProseMirror document typography & blocks)
│       │       └── index.scss               (Main style bundle exported to consumers)
│       ├── ng-package.json
│       ├── package.json
│       └── tsconfig.lib.json
│
├── src/                                     <-- Consumer Web Application (inkframe-app)
│   ├── app/
│   │   ├── core/                            <-- Application Singletons & State Management
│   │   │   ├── services/
│   │   │   │   ├── document-manager.service.ts (IndexedDB index, document CRUD, active doc)
│   │   │   │   ├── export.service.ts        (File downloads: Markdown, HTML, JSON, print)
│   │   │   │   ├── share.service.ts         (URL compression, base64 hash & clipboard)
│   │   │   │   └── shortcuts.service.ts     (Global keyboard shortcut manager)
│   │   │   ├── models/
│   │   │   │   ├── document.model.ts        (DocMeta, DocumentArchive, SharePayload)
│   │   │   │   └── settings.model.ts        (UserSettings, ThemeMode, EditorWidth)
│   │   │   └── constants/
│   │   │       ├── welcome-doc.ts           (Starter onboarding document)
│   │   │       └── templates.ts             (Meeting notes, Spec, Checklist presets)
│   │   │
│   │   ├── shared/                          <-- Reusable UI Primitives (Standalone Components)
│   │   │   ├── ui/
│   │   │   │   ├── toast/
│   │   │   │   │   ├── toast.service.ts     (Imperative notification dispatch)
│   │   │   │   │   └── toast-container.component.ts
│   │   │   │   ├── skeleton/
│   │   │   │   │   └── skeleton.component.ts (Shimmering card & text line loaders)
│   │   │   │   ├── empty-state/
│   │   │   │   │   └── empty-state.component.ts (Graphic, title, message & action CTA)
│   │   │   │   ├── segmented-control/
│   │   │   │   │   └── segmented-control.component.ts (Pill tab switcher)
│   │   │   │   ├── confirm-dialog/
│   │   │   │   │   └── confirm-dialog.component.ts (Accessible modal dialog)
│   │   │   │   └── status-bar/
│   │   │   │       └── status-bar.component.ts (Words, chars, reading time, zoom)
│   │   │   └── pipes/
│   │   │       ├── relative-time.pipe.ts    ("Just now", "2h ago", "Yesterday")
│   │   │       └── reading-time.pipe.ts     (Calculates "~2 min read")
│   │   │
│   │   ├── pages/                           <-- Lazy-Loaded Feature Routes
│   │   │   ├── landing/                     <-- Route: /
│   │   │   │   ├── components/              (Hero, FeatureGrid, FaqAccordion, DemoCard)
│   │   │   │   └── landing.component.ts
│   │   │   ├── docs/                        <-- Route: /docs
│   │   │   │   ├── components/              (DocCard, TemplateCarousel, FilterBar)
│   │   │   │   └── docs.component.ts
│   │   │   ├── editor/                      <-- Route: /doc/:id
│   │   │   │   ├── components/              (EditorTopBar, DocHistoryDrawer)
│   │   │   │   └── editor.component.ts
│   │   │   ├── reader/                      <-- Route: /s/:hash
│   │   │   │   ├── components/              (ReaderTopBar, ForkActionBanner)
│   │   │   │   └── reader.component.ts
│   │   │   ├── settings/                    <-- Route: /settings
│   │   │   │   ├── components/              (AppearanceSection, BackupSection)
│   │   │   │   └── settings.component.ts
│   │   │   └── not-found/                   <-- Route: **
│   │   │       └── not-found.component.ts
│   │   │
│   │   ├── app.config.ts                    (Application providers, router, animations)
│   │   ├── app.config.server.ts             (SSR server configuration)
│   │   ├── app.routes.ts                    (Lazy route definitions via loadComponent)
│   │   ├── app.routes.server.ts             (Prerender vs Client render configuration)
│   │   ├── app.html                         (<router-outlet /> and toast container)
│   │   ├── app.scss
│   │   └── app.ts                           (Root application shell)
│   │
│   ├── styles.scss                          (Global theme integration: @use '@inkframe-ui/editor/styles')
│   └── index.html                           (Fonts, Material Icons, PWA viewport meta)
└── angular.json
```

---

### 4.1 Extensibility Guidelines: Adding Features Easily

| When You Want to Add: | Location to Modify / Extend: | How to Do It Cleanly: |
| :--- | :--- | :--- |
| **New ProseMirror Mark or Node** *(e.g. Footnotes, Audio, Math)* | `projects/inkframe-editor/core/schema.ts` | 1. Define node/mark spec in `schema.ts`.<br>2. Add custom NodeView in `core/node-views/` if interactive.<br>3. Add input rule in `core/input-rules.ts`.<br>4. Register slash action in `core/slash-items.ts` or button in `toolbar/`. |
| **New Feature Page** *(e.g. `/templates`, `/analytics`)* | `src/app/pages/<new-feature>/` | 1. Create `<feature>.component.ts` as `standalone: true`.<br>2. Add a single line to `src/app/app.routes.ts` with `loadComponent: () => import(...)`. |
| **New Reusable UI Primitive** *(e.g. Dropdown, Badge, Modal)* | `src/app/shared/ui/<primitive>/` | Create standalone component in `src/app/shared/ui/`. It can be immediately imported by any page without module registration. |
| **New Export Format** *(e.g. PDF, Docx, EPUB)* | `src/app/core/services/export.service.ts` | Add method in `ExportService` consuming `EditorComponent.getHtml()` or `getJSON()`. |
| **New Document Template** | `src/app/core/constants/templates.ts` | Append a template preset with title, icon, and default ProseMirror JSON structure. |

---

## 5. Multi-Phase Implementation Plan

```
Phase 1: Design Tokens & Reusable UI Foundation
   ↓
Phase 2: Editor Shell Redesign (Top Bar, Canvas & Status Bar)
   ↓
Phase 3: Documents Library Page (`/docs`) & Template Engine
   ↓
Phase 4: Shared Reader View (`/s/:hash`) & Route Architecture
   ↓
Phase 5: Settings Page & Full Backup / Migration System
   ↓
Phase 6: Mobile Responsiveness, Keyboard Toolbar & PWA Offline
   ↓
Phase 7: Testing, Production Hardening & Release Verification
```

---

### Phase 1: Design Tokens & Reusable UI Foundation

#### Objectives
Establish the unified token system and a lightweight, reusable standalone UI component library across the application.

#### Tasks
1. **Token Integration (`src/styles.scss`, `tokens.scss`):**
   - Implement the CSS variable token palette (`--ink-bg`, `--ink-surface`, `--ink-accent-soft`, etc.).
   - Standardize focus rings (`0 0 0 3px var(--ink-border-focus)`), button heights (36px desktop, 44px mobile), and border radii.
2. **Shared UI Components (`src/app/shared/ui/`):**
   - **`ToastService` & `<ink-toast-container>`:** Non-blocking notification stack at bottom-center (success, error, copy confirmation).
   - **`SkeletonComponent`:** Shimmering placeholders for top bar, doc cards, and editor sheet.
   - **`EmptyStateComponent`:** Clean graphic/icon, title, descriptive message, and action CTA button.
   - **`ConfirmDialogComponent`:** Accessible modal dialog replacing native `window.confirm()`.
   - **`SegmentedControlComponent`:** Pill-based tab switcher for view modes (Editor / Preview).

#### Deliverables & Verification
- Unit test suite for `ToastService`.
- Visual verification of token palette switching in both light and dark themes.

---

### Phase 2: Editor Shell Redesign (Top Bar, Canvas & Status Bar)

#### Objectives
Eliminate nested borders, consolidate the header into a sleek 56px bar, streamline toolbar actions, and introduce the 28px bottom status bar.

#### Tasks
1. **Single-Row 56px Top Bar:**
   - **Left:** Brand logo / back arrow leading to `/docs`, followed by an **inline-editable document title** (renders as text, transforms into an input on click/focus with Enter/Escape handlers).
   - **Center:** Modern Segmented Control for `Editor` | `Preview` switching.
   - **Right:**
     - Silent Autosave indicator (`Saving...` spinner -> `Saved ✓` tick).
     - Documents / History drawer trigger button.
     - Primary violet `Share` button (triggers short-link generation modal).
     - `⋯` Kebab dropdown menu holding: `New Document`, `Export (MD/HTML/JSON)`, `Import`, `Delete Document`.
2. **Clean Canvas & Sheet (`.ink-doc-page`):**
   - Eliminate redundant wrapper borders and nested margins.
   - Canvas sits directly on `--ink-bg`.
   - The writing surface is a single `--ink-surface` sheet with max-width 760px, centered with generous padding.
3. **Sticky 44px Toolbar Strip:**
   - Positioned cleanly beneath the top bar without an enclosing border card.
   - Grouped button clusters:
     - Group 1: Undo / Redo.
     - Group 2: Block Type Selector (`Paragraph`, `H1`, `H2`, `H3`, `Code`, `Quote`, `Callout`).
     - Group 3: Formatting (`Bold`, `Italic`, `Underline`, `Strikethrough`, `Code`, `Color`).
     - Group 4: Lists (`Bulleted`, `Numbered`, `Task Checklist`).
     - Group 5: Insert dropdown (`Table`, `Image`, `Link`, `Divider`).
   - Active state styling: `--ink-accent-soft` background with `--ink-accent-text`.
4. **28px Bottom Status Bar:**
   - Left: Real-time stats (`Words: 450 · Chars: 2,890 · Reading time: ~2 min`).
   - Right: Reading width toggle (Standard 760px / Wide 980px / Full-width) and quick shortcuts guide trigger.
5. **Drawer Refactor:**
   - Redesign the Documents & Version History drawer into a clean 360px panel with soft background scrim.

#### Deliverables & Verification
- Header height verified at 56px; zero horizontal scroll on desktop.
- Inline title renaming immediately updates IndexedDB index and route metadata.
- Autosave status reflects debounced background write operations.

---

### Phase 3: Documents Library Page (`/docs`) & Template Engine

#### Objectives
Build a dedicated document dashboard for managing multiple notes, templates, and batch operations.

#### Tasks
1. **Component Scaffolding (`src/app/pages/docs/`):**
   - Standalone `DocsLibraryComponent` registered at `/docs`.
2. **Dashboard Layout:**
   - **Header:** Page title ("My Documents"), search input with instant debounced filtering, and "+ New Document" button.
   - **Filter Strip:** Sort by (Recently Edited, Created Date, Alphabetical, Word Count) and view toggles (Grid / List).
   - **Template Starters:** Horizontal chip carousel:
     - *Blank Note*
     - *Meeting Notes*
     - *Technical Specification*
     - *Sprint Task Checklist*
     - *Blog Post Draft*
3. **Document Cards (Grid View) & Table Rows (List View):**
   - Display: Document title, snippet preview, relative time (`Updated 2h ago`), word count badge.
   - Action Menu (`⋯`): Rename, Duplicate, Export, Delete.
4. **Empty & Loading States:**
   - 6 shimmering skeleton cards while IndexedDB index loads.
   - Empty state illustration when 0 documents exist, inviting user to create their first doc or try a template.
   - "No matching documents" state with a clear search button.

#### Deliverables & Verification
- Smooth navigation between `/docs` and `/doc/:id`.
- Duplicate document generates an independent clone with `- Copy` suffix.
- Deletion removes both metadata index and document payload with confirmation toast.

---

### Phase 4: Shared Reader View (`/s/:hash`) & Route Architecture

#### Objectives
Extract the shared view into a dedicated reader experience, decoupling viewer logic from the editor bundle.

#### Tasks
1. **Route Extraction (`/s/:hash`):**
   - Implement `SharedReaderComponent`.
   - Read compressed base64 / hash parameter from route.
2. **Distraction-Free Reader Interface:**
   - Zero editor toolbars or editing controls.
   - Minimalist top bar: Document title, estimated reading time, theme toggle (`Dark` / `Light`), and a high-visibility CTA: **"Copy to my editor" / "Fork Document"**.
   - Copy action parses the shared payload, writes it to the user's local IndexedDB as a new document, and seamlessly navigates to `/doc/:newId`.
3. **Reader Content Security & Performance:**
   - HTML sanitization via DOMPurify.
   - Prism.js syntax highlighting pre-applied to code blocks.
   - Interactive checklist items allow local toggle in preview mode without corrupting the read-only state.

#### Deliverables & Verification
- Sharing URLs generate compact, shareable links.
- "Copy to my editor" reliably clones the shared document into local storage.
- Invalid or corrupted share links route gracefully to a dedicated error state.

---

### Phase 5: Settings Page & Full Backup System

#### Objectives
Provide comprehensive user settings, customization controls, and privacy-first data portability.

#### Tasks
1. **Settings Page (`/settings`):**
   - Section 1: **Appearance** (Obsidian Dark, Clean Light, System Preference).
   - Section 2: **Editor Preferences** (Default canvas width: 760px / 900px, Font family: Sans-serif / Serif / Monospace).
   - Section 3: **Data & Backup Management**:
     - *Download Full Backup:* Exports all documents, templates, and images as a single timestamped `.inkframe.json` archive.
     - *Restore from Backup:* File upload parser that merges or restores saved documents into IndexedDB.
     - *Clear All Data:* Danger zone action requiring double confirmation to purge IndexedDB storage.
2. **Not Found Page (`**`):**
   - Friendly 404 page with clean illustration, helpful error copy, and buttons to return home or open the documents library.

#### Deliverables & Verification
- Full round-trip backup export and import test verified.
- Settings values persist across browser sessions.

---

### Phase 6: Mobile Responsiveness, Keyboard Toolbar & PWA Offline

#### Objectives
Deliver a first-class mobile writing experience on phones and tablets.

#### Tasks
1. **Dynamic Mobile Toolbar:**
   - Pinned directly above the software keyboard using the `visualViewport` resize API.
   - Single horizontally scrollable row with 44px touch targets.
2. **Mobile Layout Adjustments:**
   - Top bar shrinks to 48px with back arrow, truncated title, and kebab menu.
   - Sheet transitions to full-bleed layout with 16px horizontal padding.
   - Prevent iOS Safari auto-zoom on input focus by maintaining 16px minimum text sizing.
   - Use `100dvh` and CSS environment variables (`env(safe-area-inset-bottom)`).
3. **Bottom Sheet Drawers:**
   - Transform right-side slide drawers into mobile bottom sheets with drag handles and touch-dismiss gestures.
4. **PWA Enhancements:**
   - Service worker caching for fonts, icons, and bundles ensuring 100% offline startup.

#### Deliverables & Verification
- Mobile Safari and Chrome touch testing on simulated viewports.
- Keyboard opening/closing does not push the top navigation offscreen.

---

### Phase 7: Testing, Production Hardening & Release Verification

#### Objectives
Verify performance, stabilize test suites, and package for distribution.

#### Tasks
1. **Test Suite Stabilization:**
   - Resolve Vitest worker pool configurations for Windows environments (`threads` / single-thread configuration).
   - Ensure 100% pass rate across `core.spec.ts` and `app.spec.ts`.
2. **Build Optimization:**
   - Validate both `@inkframe-ui/editor` library build (`ng build inkframe-editor`) and application build (`ng build inkframe-app`).
   - Audit bundle sizes against budgets (< 1.5MB initial).
3. **Documentation Sync:**
   - Update `README.md`, `Inkframe_Editor_Documentation.md`, and changelogs.

---

## 5. Execution Roadmap & Milestones

```
Milestone 1: Design Tokens & UI Kit (Phase 1) ─────────────► Days 1-2
Milestone 2: Editor Shell & Toolbar Streamline (Phase 2) ──► Days 3-4
Milestone 3: Documents Library Page (`/docs`) (Phase 3) ──► Days 5-6
Milestone 4: Reader (`/s/:hash`) & Settings (Phases 4-5) ─► Days 7-8
Milestone 5: Mobile Experience & PWA (Phase 6) ────────────► Day 9
Milestone 6: Hardening, Testing & Polish (Phase 7) ────────► Day 10
```

---

## 6. Definition of Done (DoD)

- [ ] **Visual Integrity:** Zero nested borders; single-surface clean writing sheet; dark/light theme consistency.
- [ ] **Responsive:** Mobile keyboard toolbar pins accurately without layout shifts; touch targets >= 44px.
- [ ] **State Coverage:** Skeletons for loading; empty states with action CTAs; non-intrusive toast feedback.
- [ ] **Data Safety:** Silent debounced autosave; version history snapshots; full JSON backup export & restore.
- [ ] **Package Isolation:** `@inkframe-ui/editor` compiles independently with zero leaky dependencies.
- [ ] **Build & Quality:** 100% clean builds with 0 compiler warnings and passing unit tests.
