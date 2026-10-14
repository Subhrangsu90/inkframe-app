import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { history, undo, redo } from 'prosemirror-history';
import { toggleMark } from 'prosemirror-commands';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';
import { textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { EditorExtension, createExtension } from '../editor/extension-types';
import {
  paragraph,
  heading,
  highlight,
  callout,
  link,
  underline,
  strikethrough,
  subscript,
  superscript,
  textColor,
  small,
  code,
  task_list,
  task_item,
  bullet_list,
  ordered_list,
  list_item,
  image,
  code_block,
  tableNodeSpecs,
} from '../schema/schema';
import { markRule } from './input-rules';
import { bulletListRule, orderedListRule, taskItemRule } from './lists/list-input-rules';
import { toggleListCommand } from './lists/list-commands';
import {
  clearFormattingCommand,
  setBlockTypeKeepingAlign,
  setTextAlignCommand,
  splitAlignedBlockCommand,
  toggleHighlightCommand,
} from './commands';
import {
  searchPlugin,
  findNextCommand,
  findPreviousCommand,
  getSearchState,
} from './search/search.plugin';
import { DEFAULT_PLACEHOLDER, placeholderPlugin } from './placeholder/placeholder.plugin';
import { pasteCleanupPlugin } from './paste-cleanup/paste-cleanup';
import { tableUIPlugin } from './table/table-ui.plugin';
import { highlightPlugin } from './code-block/highlight.plugin';
import { CalloutNodeView } from './callout/callout.node-view';
import { ImageNodeView } from './image/image.node-view';
import { TaskItemNodeView } from './lists/task-item.node-view';
import { CodeBlockNodeView } from './code-block/code-block.node-view';

// ── Essential Document Nodes ──────────────────────────────────────

export const DocExtension = createExtension({
  name: 'doc',
  nodes: { doc: basicNodes.doc },
});

export const ParagraphExtension = createExtension({
  name: 'paragraph',
  nodes: { paragraph },
  keymaps: (ctx) => ({
    'Mod-Alt-0': setBlockTypeKeepingAlign(ctx.schema.nodes['paragraph']),
  }),
  slashItems: [
    {
      id: 'p',
      label: 'Text',
      hint: 'Plain paragraph',
      icon: 'notes',
      keywords: ['paragraph', 'text'],
      run: (s) => s.paragraph(),
    },
  ],
});

export const TextExtension = createExtension({
  name: 'text',
  nodes: { text: basicNodes.text },
});

export const HardBreakExtension = createExtension({
  name: 'hard_break',
  nodes: { hard_break: basicNodes.hard_break },
  keymaps: (ctx) => ({
    'Shift-Enter': (state, dispatch) => {
      dispatch?.(
        state.tr.replaceSelectionWith(ctx.schema.nodes['hard_break'].create()).scrollIntoView(),
      );
      return true;
    },
  }),
});

// ── History (Undo / Redo) ─────────────────────────────────────────

export const HistoryExtension = createExtension({
  name: 'history',
  plugins: () => [history()],
  keymaps: () => ({
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  }),
  toolbarItems: [
    {
      id: 'undo',
      group: 'history',
      icon: 'undo',
      tooltip: 'Undo (Ctrl+Z)',
      shortcut: 'Ctrl+Z',
      isDisabled: (s) => !s.canUndo(),
      run: (s) => s.undo(),
    },
    {
      id: 'redo',
      group: 'history',
      icon: 'redo',
      tooltip: 'Redo (Ctrl+Y)',
      shortcut: 'Ctrl+Y',
      isDisabled: (s) => !s.canRedo(),
      run: (s) => s.redo(),
    },
  ],
});

// ── Inline Typography & Formatting ────────────────────────────────

export const BoldExtension = createExtension({
  name: 'bold',
  marks: { strong: basicMarks.strong },
  inputRules: (ctx) => [markRule(/\*\*([^*]+)\*\*$/, ctx.schema.marks['strong'])],
  keymaps: (ctx) => ({
    'Mod-b': toggleMark(ctx.schema.marks['strong']),
  }),
  toolbarItems: [
    {
      id: 'bold',
      group: 'formatting',
      icon: 'format_bold',
      tooltip: 'Bold (Ctrl+B)',
      shortcut: 'Ctrl+B',
      isActive: (s) => s.isBold(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleBold(),
    },
  ],
  floatingItems: [
    {
      id: 'bold',
      icon: 'format_bold',
      tooltip: 'Bold (Ctrl+B)',
      isActive: (s) => s.isBold(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleBold(),
    },
  ],
});

export const ItalicExtension = createExtension({
  name: 'italic',
  marks: { em: basicMarks.em },
  inputRules: (ctx) => [markRule(/(?:^|\s)_([^_\s][^_]*)_$/, ctx.schema.marks['em'])],
  keymaps: (ctx) => ({
    'Mod-i': toggleMark(ctx.schema.marks['em']),
  }),
  toolbarItems: [
    {
      id: 'italic',
      group: 'formatting',
      icon: 'format_italic',
      tooltip: 'Italic (Ctrl+I)',
      shortcut: 'Ctrl+I',
      isActive: (s) => s.isItalic(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleItalic(),
    },
  ],
  floatingItems: [
    {
      id: 'italic',
      icon: 'format_italic',
      tooltip: 'Italic (Ctrl+I)',
      isActive: (s) => s.isItalic(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleItalic(),
    },
  ],
});

export const UnderlineExtension = createExtension({
  name: 'underline',
  marks: { underline },
  keymaps: (ctx) => ({
    'Mod-u': toggleMark(ctx.schema.marks['underline']),
  }),
  toolbarItems: [
    {
      id: 'underline',
      group: 'formatting',
      icon: 'format_underlined',
      tooltip: 'Underline (Ctrl+U)',
      shortcut: 'Ctrl+U',
      isActive: (s) => s.isUnderline(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleUnderline(),
    },
  ],
  floatingItems: [
    {
      id: 'underline',
      icon: 'format_underlined',
      tooltip: 'Underline (Ctrl+U)',
      isActive: (s) => s.isUnderline(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleUnderline(),
    },
  ],
});

export const StrikeExtension = createExtension({
  name: 'strike',
  marks: { strikethrough },
  inputRules: (ctx) => [markRule(/~~([^~]+)~~$/, ctx.schema.marks['strikethrough'])],
  keymaps: (ctx) => ({
    'Shift-Mod-s': toggleMark(ctx.schema.marks['strikethrough']),
  }),
  toolbarItems: [
    {
      id: 'strike',
      group: 'formatting',
      icon: 'format_strikethrough',
      tooltip: 'Strikethrough (Ctrl+Shift+S)',
      shortcut: 'Ctrl+Shift+S',
      isActive: (s) => s.isStrike(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleStrike(),
    },
  ],
  floatingItems: [
    {
      id: 'strike',
      icon: 'format_strikethrough',
      tooltip: 'Strikethrough (Ctrl+Shift+S)',
      isActive: (s) => s.isStrike(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleStrike(),
    },
  ],
});

export const CodeExtension = createExtension({
  name: 'code',
  marks: { code },
  inputRules: (ctx) => [markRule(/`([^`]+)`$/, ctx.schema.marks['code'])],
  keymaps: (ctx) => ({
    'Mod-e': toggleMark(ctx.schema.marks['code']),
    'Shift-Mod-m': toggleMark(ctx.schema.marks['code']),
  }),
  toolbarItems: [
    {
      id: 'code',
      group: 'formatting',
      icon: 'code',
      tooltip: 'Inline code (Ctrl+E)',
      shortcut: 'Ctrl+E',
      isActive: (s) => s.isCode(),
      run: (s) => s.toggleCode(),
    },
  ],
  floatingItems: [
    {
      id: 'code',
      icon: 'code',
      tooltip: 'Inline code (Ctrl+E)',
      isActive: (s) => s.isCode(),
      run: (s) => s.toggleCode(),
    },
  ],
});

export const SubscriptExtension = createExtension({
  name: 'subscript',
  marks: { subscript },
  inputRules: (ctx) => [markRule(/~([^~]+)~$/, ctx.schema.marks['subscript'])],
  keymaps: (ctx) => ({
    'Shift-Mod-,': toggleMark(ctx.schema.marks['subscript']),
  }),
  toolbarItems: [
    {
      id: 'subscript',
      group: 'formatting',
      glyph: 'x₂',
      tooltip: 'Subscript (Ctrl+Shift+,)',
      shortcut: 'Ctrl+Shift+,',
      isActive: (s) => s.isSubscript(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleSubscript(),
    },
  ],
});

export const SuperscriptExtension = createExtension({
  name: 'superscript',
  marks: { superscript },
  inputRules: (ctx) => [markRule(/\^([^^]+)\^$/, ctx.schema.marks['superscript'])],
  keymaps: (ctx) => ({
    'Shift-Mod-.': toggleMark(ctx.schema.marks['superscript']),
  }),
  toolbarItems: [
    {
      id: 'superscript',
      group: 'formatting',
      glyph: 'x²',
      tooltip: 'Superscript (Ctrl+Shift+.)',
      shortcut: 'Ctrl+Shift+.',
      isActive: (s) => s.isSuperscript(),
      isDisabled: (s) => s.isCode(),
      run: (s) => s.toggleSuperscript(),
    },
  ],
});

export const TextColorExtension = createExtension({
  name: 'textColor',
  marks: { textColor },
});

export const SmallExtension = createExtension({
  name: 'small',
  marks: { small },
  keymaps: (ctx) => ({
    'Mod-Alt-7': toggleMark(ctx.schema.marks['small']),
  }),
});

/** Background color behind text, picked from `HIGHLIGHT_COLORS`. */
export const HighlightExtension = createExtension({
  name: 'highlight',
  marks: { highlight },
  keymaps: () => ({
    'Mod-Alt-h': toggleHighlightCommand,
  }),
});

// ── Alignment ─────────────────────────────────────────────────────

/** Left, center, right and justified paragraphs and headings. */
export const TextAlignExtension = createExtension({
  name: 'text_align',
  keymaps: () => ({
    'Shift-Mod-l': setTextAlignCommand('left'),
    'Shift-Mod-e': setTextAlignCommand('center'),
    'Shift-Mod-r': setTextAlignCommand('right'),
    'Shift-Mod-j': setTextAlignCommand('justify'),
    Enter: splitAlignedBlockCommand,
  }),
});

// ── Structure Blocks (Headings, Quote, Code Block) ────────────────

export const HeadingExtension = createExtension({
  name: 'heading',
  nodes: { heading },
  inputRules: (ctx) => [
    textblockTypeInputRule(/^(#{1,6})\s$/, ctx.schema.nodes['heading'], (m) => ({
      level: m[1].length,
    })),
  ],
  keymaps: (ctx) => ({
    'Mod-Alt-1': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 1 }),
    'Mod-Alt-2': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 2 }),
    'Mod-Alt-3': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 3 }),
    'Mod-Alt-4': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 4 }),
    'Mod-Alt-5': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 5 }),
    'Mod-Alt-6': setBlockTypeKeepingAlign(ctx.schema.nodes['heading'], { level: 6 }),
  }),
  slashItems: [
    {
      id: 'h1',
      label: 'Heading 1',
      hint: 'Large heading',
      icon: 'format_h1',
      keywords: ['h1', 'title'],
      run: (s) => s.heading(1),
    },
    {
      id: 'h2',
      label: 'Heading 2',
      hint: 'Medium heading',
      icon: 'format_h2',
      keywords: ['h2'],
      run: (s) => s.heading(2),
    },
    {
      id: 'h3',
      label: 'Heading 3',
      hint: 'Small heading',
      icon: 'format_h3',
      keywords: ['h3'],
      run: (s) => s.heading(3),
    },
  ],
});

export const BlockquoteExtension = createExtension({
  name: 'blockquote',
  nodes: { blockquote: basicNodes.blockquote },
  inputRules: (ctx) => [wrappingInputRule(/^\s*>\s$/, ctx.schema.nodes['blockquote'])],
  slashItems: [
    {
      id: 'q',
      label: 'Quote',
      hint: 'Blockquote',
      icon: 'format_quote',
      keywords: ['blockquote', 'quote'],
      run: (s) => s.blockquote(),
    },
  ],
});

export const CodeBlockExtension = createExtension({
  name: 'code_block',
  nodes: { code_block },
  inputRules: (ctx) => [
    textblockTypeInputRule(/^`{3}([a-z0-9_-]+)?\s$/, ctx.schema.nodes['code_block'], (m) => ({
      language: m[1]?.toLowerCase() || 'typescript',
    })),
  ],
  plugins: () => [highlightPlugin()],
  nodeViews: () => ({
    code_block: (node, view, getPos) => new CodeBlockNodeView(node, view, getPos),
  }),
  slashItems: [
    {
      id: 'cb',
      label: 'Code block',
      hint: 'Monospace block with syntax highlighting',
      icon: 'code',
      keywords: ['code', 'pre', 'typescript', 'block'],
      run: (s) => s.codeBlock(),
    },
  ],
});

// ── Lists (Bullet, Numbered, Task list) ───────────────────────────
// Each list extension brings its list node; bullet and numbered lists share
// list_item. Any of them also brings the list keys (Enter, Tab, Backspace,
// Delete, Mod-Enter, Alt+Shift+Up/Down), the merging of adjacent lists and
// drag-to-move (see ExtensionManager).

export const BulletListExtension = createExtension({
  name: 'bullet_list',
  nodes: { bullet_list, list_item },
  inputRules: (ctx) => [bulletListRule(ctx.schema.nodes['bullet_list'])],
  keymaps: () => ({
    'Shift-Mod-8': toggleListCommand('bullet_list'),
  }),
  slashItems: [
    {
      id: 'ul',
      label: 'Bullet list',
      hint: 'Unordered list',
      icon: 'format_list_bulleted',
      keywords: ['ul', 'bullets', 'list'],
      run: (s) => s.toggleList('bullet_list'),
    },
  ],
});

export const OrderedListExtension = createExtension({
  name: 'ordered_list',
  nodes: { ordered_list, list_item },
  inputRules: (ctx) => [orderedListRule(ctx.schema.nodes['ordered_list'])],
  keymaps: () => ({
    'Shift-Mod-7': toggleListCommand('ordered_list'),
  }),
  slashItems: [
    {
      id: 'ol',
      label: 'Numbered list',
      hint: 'Ordered list',
      icon: 'format_list_numbered',
      keywords: ['ol', 'numbers', 'list'],
      run: (s) => s.toggleList('ordered_list'),
    },
  ],
});

export const TaskListExtension = createExtension({
  name: 'task_list',
  nodes: { task_list, task_item },
  inputRules: () => [taskItemRule()],
  keymaps: () => ({
    'Shift-Mod-6': toggleListCommand('task_list'),
  }),
  nodeViews: () => ({
    task_item: (node, view, getPos) => new TaskItemNodeView(node, view, getPos),
  }),
  slashItems: [
    {
      id: 'todo',
      label: 'Task list',
      hint: 'Checklist with interactive checkboxes',
      icon: 'check_box',
      keywords: ['todo', 'task', 'checklist', 'check'],
      run: (s) => s.toggleTaskList(),
    },
  ],
});

// ── Tables ────────────────────────────────────────────────────────

export const TableExtension = createExtension({
  name: 'table',
  nodes: tableNodeSpecs,
  plugins: () => [
    columnResizing({ handleWidth: 6, cellMinWidth: 45, lastColumnResizable: true }),
    tableEditing(),
    tableUIPlugin(),
  ],
  keymaps: () => ({
    Tab: goToNextCell(1),
    'Shift-Tab': goToNextCell(-1),
  }),
  slashItems: [
    {
      id: 'tbl',
      label: 'Table',
      hint: '3 × 3 interactive table',
      icon: 'table_chart',
      keywords: ['grid', 'table'],
      run: (s) => s.insertTable(3, 3),
    },
  ],
});

// ── Callouts ──────────────────────────────────────────────────────

export const CalloutExtension = createExtension({
  name: 'callout',
  nodes: { callout },
  nodeViews: (ctx) => ({
    callout: (node, view, getPos) =>
      new CalloutNodeView(node, view, getPos, ctx.service.envInjector, ctx.service.appReference),
  }),
  slashItems: [
    {
      id: 'cl',
      label: 'Callout',
      hint: 'Highlighted note or alert block',
      icon: 'info',
      keywords: ['note', 'info', 'callout', 'alert'],
      run: (s) => s.insertCallout('info'),
    },
  ],
});

// ── Links ─────────────────────────────────────────────────────────

export const LinkExtension = createExtension({
  name: 'link',
  marks: { link },
  keymaps: (ctx) => ({
    'Mod-k': () => {
      ctx.service.requestLinkEditor();
      return true; // also stops the browser's own Ctrl+K (address bar search)
    },
  }),
  toolbarItems: [
    {
      id: 'link',
      group: 'insert',
      icon: 'link',
      tooltip: 'Insert or edit link (Ctrl+K)',
      shortcut: 'Ctrl+K',
      isActive: (s) => s.isLink(),
      run: (s) => {
        if (typeof window === 'undefined') return;
        const current = s.getLinkHref() || '';
        const href = window.prompt('Enter link URL (https://...):', current);
        if (href) {
          s.setLink(href);
        } else if (href === '') {
          s.removeLink();
        }
      },
    },
  ],
  floatingItems: [
    {
      id: 'link',
      icon: 'link',
      tooltip: 'Link (Ctrl+K)',
      isActive: (s) => s.isLink(),
      run: (s) => {
        if (typeof window === 'undefined') return;
        const current = s.getLinkHref() || '';
        const href = window.prompt('Enter link URL (https://...):', current);
        if (href) {
          s.setLink(href);
        } else if (href === '') {
          s.removeLink();
        }
      },
    },
  ],
});

// ── Images ────────────────────────────────────────────────────────

export const ImageExtension = createExtension({
  name: 'image',
  nodes: { image },
  nodeViews: (ctx) => ({
    image: (node, view, getPos) =>
      new ImageNodeView(node, view, getPos, (data) => ctx.service.openImagePreview(data)),
  }),
  slashItems: [
    {
      id: 'img',
      label: 'Image',
      hint: 'Upload image (indexedDB backed)',
      icon: 'image',
      keywords: ['image', 'photo', 'picture', 'upload'],
      run: (s) => {
        if (typeof document === 'undefined') return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) s.insertImage(file);
        };
        input.click();
      },
    },
  ],
});

// ── Horizontal Rule / Divider ─────────────────────────────────────

export const DividerExtension = createExtension({
  name: 'divider',
  nodes: { horizontal_rule: basicNodes.horizontal_rule },
  slashItems: [
    {
      id: 'hr',
      label: 'Divider',
      hint: 'Horizontal separator line',
      icon: 'horizontal_rule',
      keywords: ['hr', 'line', 'divider', 'separator'],
      run: (s) => s.insertDivider(),
    },
  ],
});

// ── Clear Formatting ──────────────────────────────────────────────

export const ClearFormattingExtension = createExtension({
  name: 'clear_formatting',
  keymaps: () => ({
    'Mod-\\': clearFormattingCommand,
  }),
  toolbarItems: [
    {
      id: 'clearFormatting',
      group: 'action',
      icon: 'format_clear',
      tooltip: 'Clear formatting (Ctrl+\\)',
      shortcut: 'Ctrl+\\',
      run: (s) => s.clearFormatting(),
    },
  ],
});

// ── Find and Replace ──────────────────────────────────────────────

const whileSearching =
  (command: typeof findNextCommand): typeof findNextCommand =>
  (state, dispatch, view) =>
    !!getSearchState(state)?.query && command(state, dispatch, view);

export const SearchExtension = createExtension({
  name: 'search',
  plugins: () => [searchPlugin()],
  keymaps: (ctx) => ({
    'Mod-f': () => {
      ctx.service.openSearch();
      return true; // instead of the browser's find bar, which cannot see into the editor's state
    },
    // Mod-h on Windows and Linux, Shift-Mod-h on macOS (where Cmd+H hides the app).
    'Mod-h': () => {
      ctx.service.openSearch({ replace: true });
      return true;
    },
    'Shift-Mod-h': () => {
      ctx.service.openSearch({ replace: true });
      return true;
    },
    'Mod-g': whileSearching(findNextCommand),
    'Shift-Mod-g': whileSearching(findPreviousCommand),
    Escape: () => {
      if (!ctx.service.searchOpen()) return false;
      ctx.service.closeSearch();
      return true;
    },
  }),
});

// ── Placeholder ───────────────────────────────────────────────────

/** Shows `text` while the document is empty. */
export function createPlaceholderExtension(text: string = DEFAULT_PLACEHOLDER): EditorExtension {
  return createExtension({
    name: 'placeholder',
    plugins: () => [placeholderPlugin(text)],
  });
}

export const PlaceholderExtension = createPlaceholderExtension();

// ── Paste Cleanup ─────────────────────────────────────────────────

/** Cleans up HTML pasted from Word, Google Docs and web pages (see `cleanPastedHtml`). */
export const PasteCleanupExtension = createExtension({
  name: 'paste_cleanup',
  plugins: () => [pasteCleanupPlugin()],
});

// ── Default / StarterKit Extension Pack ───────────────────────────

export const DEFAULT_EXTENSIONS: EditorExtension[] = [
  // Core document nodes
  DocExtension,
  ParagraphExtension,
  TextExtension,
  HardBreakExtension,

  // History
  HistoryExtension,

  // Typography & marks
  BoldExtension,
  ItalicExtension,
  UnderlineExtension,
  StrikeExtension,
  CodeExtension,
  SubscriptExtension,
  SuperscriptExtension,
  TextColorExtension,
  SmallExtension,
  HighlightExtension,

  // Hierarchy & blocks
  HeadingExtension,
  BlockquoteExtension,
  CodeBlockExtension,
  TextAlignExtension,

  // Lists
  BulletListExtension,
  OrderedListExtension,
  TaskListExtension,

  // Rich inserts
  TableExtension,
  CalloutExtension,
  LinkExtension,
  ImageExtension,
  DividerExtension,
  ClearFormattingExtension,

  // Editing aids
  SearchExtension,
  PlaceholderExtension,
  PasteCleanupExtension,
];

export const StarterKit = DEFAULT_EXTENSIONS;
