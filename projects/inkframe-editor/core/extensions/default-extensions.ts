import { nodes as basicNodes, marks as basicMarks } from 'prosemirror-schema-basic';
import { history, undo, redo } from 'prosemirror-history';
import { toggleMark } from 'prosemirror-commands';
import { textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { EditorExtension, createExtension } from '../editor/extension-types';
import {
  paragraph,
  heading,
  highlight,
  underline,
  strikethrough,
  subscript,
  superscript,
  textColor,
  small,
  code,
} from '../schema/schema';
import { markRule } from './input-rules';
import { clearFormattingCommand, toggleHighlightCommand } from './commands';
import { setBlockTypeKeepingAlign } from './text-align/text-align-commands';
import { TableExtension } from './table/table-extension';
import { CodeBlockExtension } from './code-block/code-block-extension';
import {
  BulletListExtension,
  OrderedListExtension,
  TaskListExtension,
} from './lists/list-extensions';
import { CalloutExtension } from './callout/callout-extension';
import { ImageExtension } from './image/image-extension';
import { LinkExtension } from './link/link-extension';
import { SearchExtension } from './search/search-extension';
import { PlaceholderExtension } from './placeholder/placeholder-extension';
import { PasteCleanupExtension } from './paste-cleanup/paste-cleanup-extension';
import { TextAlignExtension } from './text-align/text-align-extension';

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

// ── Structure Blocks (Headings, Quote) ────────────────────────────

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
