import { EditorExtension } from '../editor/extension-types';
import {
  DocExtension,
  HardBreakExtension,
  ParagraphExtension,
  TextExtension,
} from './document/document-extensions';
import { HistoryExtension } from './history/history-extension';
import {
  BoldExtension,
  CodeExtension,
  ItalicExtension,
  SmallExtension,
  StrikeExtension,
  SubscriptExtension,
  SuperscriptExtension,
  UnderlineExtension,
} from './marks/marks-extensions';
import { TextColorExtension } from './text-color/text-color-extension';
import { HighlightExtension } from './highlight/highlight-extension';
import { FontSizeExtension } from './font-size/font-size-extension';
import { FontFamilyExtension } from './font-family/font-family-extension';
import { HeadingExtension } from './heading/heading-extension';
import { BlockquoteExtension } from './blockquote/blockquote-extension';
import { CodeBlockExtension } from './code-block/code-block-extension';
import { TextAlignExtension } from './text-align/text-align-extension';
import {
  IndentExtension,
  LineSpacingExtension,
} from './paragraph-format/paragraph-format-extension';
import {
  BulletListExtension,
  OrderedListExtension,
  TaskListExtension,
} from './lists/list-extensions';
import { TableExtension } from './table/table-extension';
import { CalloutExtension } from './callout/callout-extension';
import { LinkExtension } from './link/link-extension';
import { ImageExtension } from './image/image-extension';
import { DividerExtension } from './divider/divider-extension';
import { ClearFormattingExtension } from './clear-formatting/clear-formatting-extension';
import { SearchExtension } from './search/search-extension';
import { PlaceholderExtension } from './placeholder/placeholder-extension';
import { PasteCleanupExtension } from './paste-cleanup/paste-cleanup-extension';
import { PageSetupExtension } from './page-setup/page-setup-extension';

/** Every built-in extension: what `<ink-editor>` uses unless given a list. */
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
  FontSizeExtension,
  FontFamilyExtension,

  // Hierarchy & blocks
  HeadingExtension,
  BlockquoteExtension,
  CodeBlockExtension,
  TextAlignExtension,
  IndentExtension,
  LineSpacingExtension,

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

  // Layout
  PageSetupExtension,
];

export const StarterKit = DEFAULT_EXTENSIONS;
