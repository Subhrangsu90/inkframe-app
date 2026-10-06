# Inkframe Editor: Advanced Features Implementation Plan

This implementation plan details the phased rollout for all features, marks, custom NodeViews, and UI components identified in the technical specification and reference UI designs (`public/pic/Screenshot1.png` – `Screenshot7.png`).

---

## Architecture Principles

1. **ProseMirror as Single Source of Truth**: All document mutations occur via ProseMirror transactions.
2. **Signal-Driven Angular Reactivity**: UI state reflects signals (`isBold`, `isUnderline`, `currentColor`, `blockInfo`, `canUndo`, `canRedo`).
3. **SSR Safety**: All browser-only APIs (`document`, `window`, `indexedDB`, Web APIs) are guarded and initialized within `afterNextRender` or environment checks.
4. **Isolated Seams**: Clean contracts between core ProseMirror plugins and Angular UI components via `EditorHooks`.
5. **Backwards Compatibility**: Schema additions ensure existing documents deserialize cleanly with fallback defaults.

---

## Phase Overview

```
Phase 1: Core Typography Marks & Shortcuts (Underline, Strike, Sub/Super, Color, Small, Clear)
   ↓
Phase 2: Task / Todo List Node & Interactive NodeView (Checkboxes, Read-only Support)
   ↓
Phase 3: Modular Toolbar Redesign & Consolidated Dropdowns (T, B ∨, := ∨)
   ↓
Phase 4: Color Palette Popover & Dual-Tab Image Dialog (File IDB / Link URL)
   ↓
Phase 5: Enhanced Code Block NodeView (Line Numbers, Language Selector, Copy, Wrap)
   ↓
Phase 6: Interactive Table NodeView & Floating Table Controls (+ Column, Alignment, Placeholder)
   ↓
Phase 7: User Mentions (@) & Dictation Voice Input (🎤)
   ↓
Phase 8: Test Coverage, Benchmarking & Production Verification
```

---

## Phase 1: Core Typography Marks & Shortcuts

### Objective
Expand the ProseMirror schema with advanced text formatting marks and implement corresponding service commands, input rules, keyboard shortcuts, and signal state.

### Scope of Work
1. **Schema Definitions (`core/schema.ts`)**:
   - `underline`: `<u>` tag, parseDOM for `<u>` and `style="text-decoration: underline"`.
   - `strikethrough`: `<s>`, `<del>`, `<strike>` tags, parseDOM for `style="text-decoration: line-through"`.
   - `subscript`: `<sub>` tag (excludes `superscript`).
   - `superscript`: `<sup>` tag (excludes `subscript`).
   - `textColor`: `<span>` with `style="color: ..."`, attrs: `{ color: string }`.
   - `small`: `<small>` tag.
2. **Commands & Service Methods (`editor.service.ts`)**:
   - `toggleUnderline()`, `toggleStrike()`, `toggleSubscript()`, `toggleSuperscript()`, `toggleSmall()`.
   - `setTextColor(color: string)`: Applies color to selection or stored mark.
   - `removeTextColor()`: Removes color mark.
   - `clearFormatting()`: Removes all marks from selection (`Ctrl+\`).
3. **Signals (`editor.service.ts`)**:
   - `readonly isUnderline = signal(false);`
   - `readonly isStrike = signal(false);`
   - `readonly isSubscript = signal(false);`
   - `readonly isSuperscript = signal(false);`
   - `readonly isSmall = signal(false);`
   - `readonly currentColor = signal<string | null>(null);`
   - Update `syncSignals()` to compute active marks.
4. **Keymaps & Input Rules (`core/plugins.ts`, `core/input-rules.ts`)**:
   - `Ctrl+U` / `Mod-u` -> Underline
   - `Ctrl+Shift+S` / `Shift-Mod-s` -> Strikethrough
   - `Ctrl+Shift+,` / `Shift-Mod-,` -> Subscript
   - `Ctrl+Shift+.` / `Shift-Mod-.` -> Superscript
   - `Ctrl+\` / `Mod-\` -> Clear formatting
   - Input rules: `~~text~~` -> strikethrough, `^text^` -> superscript, `~text~` -> subscript.
5. **Import/Export IO (`io/html.ts`, `io/markdown.ts`)**:
   - Support `~~strike~~`, `^super^`, `~sub~` in markdown serializer & parser.
   - HTML DOMSerializer handles `<u>`, `<s>`, `<sub>`, `<sup>`, `<small>`, `<span style="color: ...">`.

### Deliverables & Acceptance Criteria
- Unit tests verifying mark creation, DOM serialization, Markdown round-trip, and `clearFormatting()`.
- Keyboard shortcuts trigger smoothly without losing selection.

---

## Phase 2: Task / Todo List Node & Interactive NodeView

### Objective
Implement interactive checklist items that users can check/uncheck in both edit mode and read-only mode without full page re-renders.

### Scope of Work
1. **Schema Specs (`core/schema.ts`)**:
   - `task_list`: block container, content: `task_item+`, toDOM: `['ul', { class: 'ink-task-list' }, 0]`.
   - `task_item`: content: `paragraph block*`, attrs: `{ checked: { default: false } }`, defining: true.
2. **Task Item NodeView (`node-views/task-item.node-view.ts`)**:
   - Custom NodeView rendering an `<input type="checkbox">` and `<div class="ink-task-content">`.
   - Click listener on checkbox dispatches a transaction toggling `node.attrs.checked`.
   - `stopEvent()` captures checkbox click events so ProseMirror selection is not disrupted.
   - Checkbox is functional in both `editable = true` and `editable = false` modes.
3. **Input Rules & Shortcuts**:
   - Typing `[ ] ` or `[x] ` at the beginning of a line converts block to a `task_list`.
   - `Ctrl+Shift+6` shortcut toggles task list.
   - Enter creates a new unchecked task item; empty Enter lifts out of the task list.
4. **Styling (`styles.scss`)**:
   - Custom styled checkboxes matching Material M3 accent.
   - `.ink-task-item.checked` applies dimming or strike-through to the label text.
5. **IO Support**:
   - Markdown export renders `- [ ] ` or `- [x] `.
   - Markdown import parses `- [ ] ` and `- [x] ` into `task_item` nodes.

### Deliverables & Acceptance Criteria
- Toggling checkboxes updates document state and triggers debounced `changed` output.
- Markdown and HTML round-trips correctly preserve checked/unchecked states.

---

## Phase 3: Modular Toolbar Redesign & Consolidated Dropdowns

### Objective
Replace separate single-action buttons with the consolidated, space-efficient dropdown architecture matching reference designs in `Screenshot1.png`, `Screenshot2.png`, and `Screenshot3.png`.

### Scope of Work
1. **`T` Block Type Dropdown (`Screenshot1.png`)**:
   - Trigger button: `T` icon with active block label indicator.
   - Dropdown menu options:
     - Normal text (`Ctrl+Alt+0`)
     - Small text (`Ctrl+Alt+7`)
     - Heading 1 (`Ctrl+Alt+1`)
     - Heading 2 (`Ctrl+Alt+2`)
     - Heading 3 (`Ctrl+Alt+3`)
     - Heading 4 (`Ctrl+Alt+4`)
     - Heading 5 (`Ctrl+Alt+5`)
     - Heading 6 (`Ctrl+Alt+6`)
   - Visual styling: Selected item highlighted with badge; right-aligned keyboard shortcut hints.
2. **`B ∨` Format Dropdown (`Screenshot2.png`)**:
   - Trigger button: `B` with down caret.
   - Dropdown menu items:
     - Bold (`Ctrl+B`)
     - Italic (`Ctrl+I`)
     - Underline (`Ctrl+U`)
     - Strikethrough (`Ctrl+Shift+S`)
     - Code (`Ctrl+Shift+M` / `Ctrl+E`)
     - Subscript (`Ctrl+Shift+,`)
     - Superscript (`Ctrl+Shift+.`)
     - Divider
     - Clear formatting (`Ctrl+\`)
3. **`:= ∨` Lists Dropdown (`Screenshot3.png`)**:
   - Trigger button: List icon with down caret.
   - Dropdown menu items:
     - Bulleted list (`Ctrl+Shift+8`)
     - Numbered list (`Ctrl+Shift+7`)
     - Task list (`Ctrl+Shift+6`)
4. **Floating Selection Menu Update**:
   - Include Bold, Italic, Underline, Strikethrough, Code, Link, and Text Color buttons.

### Deliverables & Acceptance Criteria
- Menus keep editor selection intact via `mousedown (preventDefault)` + `click`.
- Dropdown options display current active states with checkmarks or tinted backgrounds.

---

## Phase 4: Color Palette Popover & Dual-Tab Image Dialog

### Objective
Implement the 21-color swatch palette (`Screenshot4.png`) and the dual-tab image upload/link dialog (`Screenshot5.png`).

### Scope of Work
1. **Text Color Picker Popover (`Screenshot4.png`)**:
   - Trigger button: `A` icon with active color indicator bar.
   - Popover panel:
     - Header: "Text color"
     - Grid: 21 swatches (3 rows × 7 columns) covering Greys, Blues, Cyans, Greens, Oranges, Reds, and Purples.
     - Checkmark displayed on active swatch.
     - "Remove color" button at bottom.
   - Clicking a swatch dispatches `setTextColor(color)` without closing selection unexpectedly.
2. **Dual-Tab Image Popover (`Screenshot5.png`)**:
   - Trigger button: Image icon in toolbar.
   - Popover with Angular Material Tabs:
     - **"File" tab**: "Upload" button with upload icon; picks image from disk and saves to IndexedDB (`inkframe_storage`).
     - **"Link" tab**: Input field for external image URL (`https://...`) with "Insert" button.
3. **Additional Toolbar Controls**:
   - Emoji picker button (`🙂`): Compact popover with common emojis.
   - Link button (`🔗`): Input dialog supporting URL and title.
   - Document revision history button (`⏱`): Opens snapshot panel.
   - Undo (`↶`) and Redo (`↷`) buttons.

### Deliverables & Acceptance Criteria
- Color picker correctly sets inline styles and removes them when requested.
- Image dialog supports both local IndexedDB uploads and remote URLs cleanly.

---

## Phase 5: Enhanced Code Block NodeView

### Objective
Upgrade code blocks into an IDE-like component with dynamic line numbers, syntax language selector, and quick copy actions (`Screenshot6.png`).

### Scope of Work
1. **Schema Specs (`core/schema.ts`)**:
   - `code_block`: Add `language` and `wrap` attributes (default: `language: 'typescript'`, `wrap: false`).
2. **Code Block NodeView (`node-views/code-block.node-view.ts`)**:
   - Host element: `<div class="ink-code-block-wrapper">`.
   - **Line numbers gutter**: Left sidebar counting lines based on `\n` characters in content.
   - **Floating control bar**:
     - **Language selector (`Select language ∨`)**: Dropdown supporting:
       `TypeScript`, `JavaScript`, `HTML`, `CSS`, `JSON`, `Python`, `SQL`, `Bash`, `Go`, `Rust`, `Java`.
     - **Word wrap toggle (`⇄`)**: Toggles CSS `white-space: pre` vs `pre-wrap`.
     - **Copy button**: Copies code content to clipboard and displays transient "Copied!" feedback.
     - **Delete button**: Removes code block.
3. **Editor Service Integration**:
   - `setCodeBlockLanguage(pos: number, lang: string)`.
   - `toggleCodeBlockWrap(pos: number)`.

### Deliverables & Acceptance Criteria
- Line numbers update in real-time as lines are added or removed.
- Language attribute persists in JSON envelope and Markdown code fence (e.g. ````typescript ... ````).

---

## Phase 6: Interactive Table NodeView & Floating Table Controls

### Objective
Provide visual table editing tools matching `Screenshot7.png`: column adder handles, header menus, cell placeholders, and floating alignment toolbars.

### Scope of Work
1. **Interactive Column Handles**:
   - Top `+` button rendered above table columns to add a new column at that index with one click.
   - Header dropdown trigger (`∨`) for column operations:
     - Insert left / right
     - Delete column
     - Column text alignment
2. **Cell Placeholder (`Screenshot7.png`)**:
   - When a table cell is empty, display a subtle CSS placeholder: `"/ to insert"`.
3. **Floating Table Toolbar (`Screenshot7.png`)**:
   - Appears whenever cursor/selection is inside a table (`svc.isInTable() = true`).
   - Controls:
     - `Table options ∨`: Add row above/below, add column, delete row/column, delete table.
     - Alignment selector (`≡ ∨`): Left, Center, Right.
     - Cell background color picker (tint cell with subtle highlights).
     - Column border / grid toggle.

### Deliverables & Acceptance Criteria
- Table resizing, cell navigation via Tab/Shift-Tab, and column insertion operate without breaking table structure.
- Placeholder displays only when cell is empty and focused/hovered.

---

## Phase 7: User Mentions (@) & Dictation Voice Input (🎤)

### Objective
Implement inline user mentions (`Screenshot3.png`, `Screenshot4.png`) and Web Speech dictation (`Screenshot7.png`).

### Scope of Work
1. **User Mentions Plugin (`core/mentions.plugin.ts`)**:
   - Triggers on `@` followed by alphanumeric query.
   - Displays user popover list with avatar initial and name (e.g. `[DK] + Debabrata Kar`).
   - Enter/Click inserts an inline `mention` node:
     `<span class="ink-mention" data-user-id="123">@Debabrata Kar</span>`.
2. **Dictation Voice Input (`toolbar/dictation.service.ts`)**:
   - Microphone button (`🎤`) in toolbar.
   - Uses browser `webkitSpeechRecognition` / `SpeechRecognition` API.
   - Live transcription inserts text at current ProseMirror selection.
   - Pulsing red active state while listening.

### Deliverables & Acceptance Criteria
- Typing `@` opens filtered list; selecting a user inserts non-editable mention pill.
- Speech recognition transcribes text accurately with graceful fallback when microphone permission is denied.

---

## Phase 8: Test Coverage, Benchmarking & Production Verification

### Objective
Ensure 100% test pass rate, no memory leaks in NodeViews, and compliance with performance benchmarks.

### Scope of Work
1. **Unit Test Expansion (`core/core.spec.ts`)**:
   - Test every new mark (`underline`, `strikethrough`, `subscript`, `superscript`, `textColor`, `small`).
   - Test `clearFormatting()` command behavior.
   - Test `task_list` and `task_item` serialization.
   - Test Markdown round-trip for code block languages and task lists.
2. **NodeView Leak Test**:
   - Mount and destroy editor 100 times, confirming all Angular component refs are destroyed.
3. **Performance Profiling**:
   - Test typing latency on a 50-page document (< 16ms frame budget).
4. **Build & SSR Validation**:
   - Run `ng build` and ensure bundle budget is met and SSR routes prerender without DOM errors.

---

## Phase Implementation Schedule & Dependencies

| Phase | Title | Dependencies | Estimated Complexity |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Core Typography Marks & Shortcuts | None (Schema extension) | Low |
| **Phase 2** | Task List Node & Interactive Checkbox | Phase 1 | Medium |
| **Phase 3** | Modular Toolbar Redesign (`T`, `B ∨`, `:= ∨`) | Phase 1 & 2 | Medium |
| **Phase 4** | Color Palette Popover & Dual-Tab Image Dialog | Phase 1 & 3 | Medium |
| **Phase 5** | Enhanced Code Block NodeView | Phase 1 | Medium |
| **Phase 6** | Interactive Table NodeView & Floating Toolbar | Phase 3 | High |
| **Phase 7** | User Mentions (@) & Dictation (🎤) | Phase 1 | Medium |
| **Phase 8** | Test Coverage & Production Verification | Phases 1–7 | Low |
