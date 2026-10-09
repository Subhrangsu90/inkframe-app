# Inkframe UI Redesign Plan

A clean, soft redesign of the Inkframe editor with a landing page, full state coverage and a mobile layout.

## What to fix in the current UI

- **Nested borders.** There is an outer border, then a toolbar border, then the page card. Use one border per surface.
- **Two-row header.** Brand, document picker, mode switch, word count, New, Save, Share and the kebab menu all compete in a small space.
- **Dense toolbar.** About 25 icons are always visible with no grouping hierarchy. Move rarely used actions into the slash menu or an overflow menu.
- **Flat dark mode.** The page card is almost the same tone as the background, so there is little depth.
- **Primary color overuse.** Purple appears on the logo, the Share button, links and the active tab. Reserve the strong purple for one primary action per screen.

## Design direction: clean and soft

- Warm off-white canvas, white surfaces, hairline borders and very light shadows.
- Generous whitespace and rounded corners (10–16px).
- A single accent (violet). Everything else is neutral.
- Motion is short and subtle (120–200ms).

## Design tokens

Define these as CSS variables on `:root`, with a `[data-theme="dark"]` override.

### Color

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` (canvas) | `#F7F6F3` | `#0E0E10` |
| `--surface` (cards, bars) | `#FFFFFF` | `#17171A` |
| `--surface-2` (hover, inputs) | `#F1F0EC` | `#1F1F23` |
| `--border` | `#E8E6E1` | `#26262B` |
| `--border-strong` | `#D6D3CC` | `#34343A` |
| `--text` | `#1B1B1F` | `#EDEDEF` |
| `--text-muted` | `#6B6B73` | `#9A9AA3` |
| `--accent` | `#7C3AED` | `#8B5CF6` |
| `--accent-soft` (active bg) | `#F3EEFF` | `#241B3D` |
| `--danger` / `--success` | `#DC2626` / `#16A34A` | slightly lighter versions |

### Typography

- **UI:** Inter, with a system fallback stack.
- **Document body:** Inter at 17px with 1.7 line-height, or optionally a serif such as Source Serif for a writing feel.
- **Code:** JetBrains Mono.
- **Scale:** 12 / 13 / 14 / 16 / 20 / 24 / 32 / 48 / 64.
- **Weights:** 400 body, 500 UI labels, 600 headings.
- Use tight letter-spacing (-0.02em) on large headings and `text-wrap: balance` on landing headlines.

### Spacing, radius, borders, shadows

- **Spacing:** 4px base scale (4, 8, 12, 16, 24, 32, 48, 64, 96).
- **Radius:** 6px for small controls, 10px for buttons and inputs, 16px for cards and modals.
- **Borders:** 1px solid `--border`. Hover uses `--border-strong`.
- **Shadows:**
  - `sm`: `0 1px 2px rgb(0 0 0 / .04)`
  - `md`: `0 4px 16px rgb(0 0 0 / .06)`
  - `lg`: `0 12px 40px rgb(0 0 0 / .10)` for modals and popovers
- **Focus ring:** `0 0 0 3px` accent at 25% opacity. Never remove focus outlines.

### Motion

150ms ease-out for hover and color changes, 200ms for panels, and respect `prefers-reduced-motion`.

## Pages and routes

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | Landing | Explain the product and send people to the editor |
| `/docs` | Documents library | Grid or list of local docs, with search, sort and templates |
| `/doc/:id` | Editor | Main writing surface |
| `/s/:hash` | Shared view | Read-only, content-only reader |
| `/settings` | Settings | Theme, font, width, export defaults and data export or clear |
| `**` | 404 | Friendly not-found page |

Keep the current Documents & History drawer as a quick switcher inside the editor, with `/docs` as the full page.

## Landing page layout

Use a max content width of 1120px with 96px vertical section spacing (48px on mobile).

1. **Sticky nav.** Logo on the left, Features, Shortcuts and GitHub in the middle, and "Open editor" as the primary button on the right. It gets a hairline bottom border once the page is scrolled.
2. **Hero.**
   - Headline: "Write beautifully. Stay offline."
   - A one-line subtext (privacy, speed, zero backend).
   - Two buttons: "Start writing" (primary) and "View demo" (secondary).
   - Below it, a real editor screenshot or live mini-editor in a soft-shadow frame, over a faint violet gradient blob.
3. **Trust strip.** Small chips: "Offline-first", "No account", "Zero telemetry", "Export to PDF/MD/HTML".
4. **Feature grid.** 3×2 cards, each with an icon, a title and a two-line description: slash commands, floating formatting bar, checklists and tables, instant share links, version history, dark mode.
5. **Interactive section.** A short looping demo of typing `/` and inserting a block.
6. **Export and share.** Two columns with a screenshot of the share dialog next to copy.
7. **FAQ.** Accordion covering where data is stored, what happens if the browser is cleared, and sharing limits.
8. **Final CTA.** One centered card with a button.
9. **Footer.** Minimal, with links and a copyright line.

## Editor layout

### Top bar (single row, 56px)

- **Left:** back arrow or logo, then an inline-editable document title. It looks like plain text until hovered.
- **Center (desktop):** Editor | Preview segmented control.
- **Right:** a quiet "Saved ✓" or "Saving…" indicator, a History icon button, a Share primary button, and a `⋯` menu holding New, Export and Import.
- The explicit Save button goes away because autosave handles it. Keep `Ctrl+S` as a shortcut.

### Toolbar

- Place it directly under the top bar as one sticky 44px strip on the canvas background, not inside a bordered box.
- Group the controls with thin dividers: block type, then inline marks, then lists, then insert, with undo and redo on the far left.
- Move the extra items (callout, emoji, highlight color) into an Insert dropdown.
- Active buttons use `--accent-soft` with accent text.
- The floating selection bar still handles quick formatting.

### Canvas

- Background is `--bg`. The page is a `--surface` sheet, max-width 760px, centered, with 64px horizontal padding, a 1px border and a `sm` shadow.
- Do not wrap the sheet in another bordered container.

### Footer status bar (28px, muted)

- Words, characters and reading time on the left.
- Zoom or width toggle on the right.
- This replaces the "373w · 2448c" pill in the header.

### Right-side panels

- History and Documents slide in as 360px drawers with a soft scrim.
- On mobile they become bottom sheets.

## Component states

### Loading

- **App boot:** skeleton of the top bar and a few shimmering text lines in the sheet, instead of a blank screen.
- **Document list:** 6 skeleton cards.
- **Export and import:** inline spinner on the button, which is disabled during the action, with a success toast afterward.
- **Share link generation:** button shows a spinner, then switches to "Copied ✓" for 2 seconds.
- **Landing demo images:** blurred placeholder, then a fade-in.

### Hover and focus

- **Buttons:** primary darkens slightly with a `translateY(-1px)` lift. Secondary gets a `--surface-2` background.
- **Icon buttons:** 32px hit target with `--surface-2` on hover, plus a tooltip after 400ms showing the shortcut.
- **Document cards:** border becomes `--border-strong`, shadow goes from `sm` to `md`, and a hover-only `⋯` actions menu appears.
- **Links:** underline offset animation.
- **Keyboard:** visible focus ring on every interactive element.

### Empty

- **No documents:** centered illustration or icon, "Your first idea starts here", a "New document" button and a "Browse templates" link.
- **Search with no results:** "No matches for 'xyz'" with a Clear search button.
- **History with no versions:** "Versions appear as you write."
- **Empty editor:** muted placeholder text such as "Type / for commands…".

### Error and disabled

- **Storage full or blocked (IndexedDB):** inline banner explaining the problem with an "Export backup" action.
- **Invalid share link:** friendly error page with a "Go to editor" button.
- **Disabled controls:** 40% opacity with a `not-allowed` cursor.
- **Destructive actions:** confirmation dialog, with the danger color used only on the confirm button.

### Feedback

Toasts at the bottom center, max 3 visible, auto-dismissing after 3 seconds.

## Mobile (under 768px)

- Top bar shrinks to 48px: back arrow, truncated title, and a Share icon plus the `⋯` menu. The mode switch moves into the menu or becomes a floating pill at the bottom.
- The formatting toolbar becomes a single horizontally scrollable row pinned above the keyboard, using `visualViewport` to position it. Make buttons at least 40px.
- The sheet goes full-bleed with no border, 16–20px side padding and 16px minimum font size so iOS doesn't zoom.
- Drawers become bottom sheets with a drag handle.
- The landing hero is single column. Buttons stack full width, the feature grid is one column, and the nav collapses into a hamburger sheet.
- Use `100dvh` and safe-area insets (`env(safe-area-inset-bottom)`).
- Tablet (768–1024px) keeps the desktop layout but drops side padding to 32px.

## Accessibility checklist

- Text contrast of at least 4.5:1 in both themes.
- Full keyboard navigation, with a visible focus ring and ARIA labels on all icon-only buttons.
- Dialogs trap focus and close on `Esc`.
- Reduced-motion support.
- Don't rely on color alone for the checked/unchecked checklist state.

## Angular implementation notes

- Put tokens in a global `tokens.scss` and build a small set of shared standalone components: `ButtonComponent`, `IconButtonComponent`, `CardComponent`, `SkeletonComponent`, `EmptyStateComponent`, `ToastService`, `DrawerComponent` and `SegmentedControl`.
- Use signals for theme, layout (mobile vs desktop via `BreakpointObserver`), save status and the current document.
- Lazy-load routes (`loadComponent`) so the landing page stays light and ProseMirror loads only on `/doc/:id`.
- Persist the theme in `localStorage` and set `data-theme` before bootstrap to avoid a flash.

## Suggested build order

1. Tokens, typography and the base component set (a day or two).
2. Editor shell: top bar, toolbar, canvas, status bar, and autosave indicator.
3. Documents library page with its empty and loading states.
4. Mobile pass on the editor, with the bottom toolbar and bottom sheets.
5. Landing page.
6. Shared view, settings, 404, then an accessibility and polish pass.
