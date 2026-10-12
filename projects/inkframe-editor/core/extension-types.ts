import { NodeSpec, MarkSpec, Schema } from 'prosemirror-model';
import { Command, Plugin } from 'prosemirror-state';
import { InputRule } from 'prosemirror-inputrules';
import { NodeViewConstructor } from 'prosemirror-view';
import { EditorHooks } from './editor-hooks';
import type { EditorService } from './editor-service';
import type { SlashItem } from './slash-items';

export type ExtensionGroup =
  | 'history'
  | 'block'
  | 'formatting'
  | 'list'
  | 'insert'
  | 'table'
  | 'align'
  | 'action'
  | 'custom';

export interface ToolbarItemDef {
  id: string;
  group?: ExtensionGroup;
  icon?: string;
  glyph?: string;
  label?: string;
  tooltip?: string;
  shortcut?: string;
  isActive?: (svc: EditorService) => boolean;
  isDisabled?: (svc: EditorService) => boolean;
  run: (svc: EditorService) => void;
  type?: 'button' | 'dropdown' | 'color' | 'custom';
  dropdownItems?: {
    id: string;
    label: string;
    glyph?: string;
    shortcut?: string;
    isActive?: (svc: EditorService) => boolean;
    run: (svc: EditorService) => void;
  }[];
}

export interface FloatingItemDef {
  id: string;
  icon?: string;
  glyph?: string;
  label?: string;
  tooltip?: string;
  isActive?: (svc: EditorService) => boolean;
  isDisabled?: (svc: EditorService) => boolean;
  run: (svc: EditorService) => void;
}

export interface ExtensionContext {
  service: EditorService;
  hooks: EditorHooks;
  schema: Schema;
}

export interface EditorExtension {
  /** Unique name identifier (e.g. 'bold', 'heading', 'table') */
  name: string;

  /** ProseMirror Node specifications introduced by this extension */
  nodes?: Record<string, NodeSpec>;

  /** ProseMirror Mark specifications introduced by this extension */
  marks?: Record<string, MarkSpec>;

  /** ProseMirror input rules (markdown shortcuts like #, >, etc.) */
  inputRules?: (ctx: ExtensionContext) => InputRule[];

  /** Keyboard shortcuts map (e.g. { 'Mod-b': toggleMark(...) }) */
  keymaps?: (ctx: ExtensionContext) => Record<string, Command>;

  /** ProseMirror plugins (e.g. history, dropCursor, custom plugins) */
  plugins?: (ctx: ExtensionContext) => Plugin[];

  /** Custom NodeViews registered for nodes in this extension */
  nodeViews?: (ctx: ExtensionContext) => Record<string, NodeViewConstructor>;

  /** Toolbar item(s) contributed to the toolbar */
  toolbarItems?: ToolbarItemDef[];

  /** Slash commands contributed to the slash menu */
  slashItems?: SlashItem[];

  /** Items contributed to the floating selection menu */
  floatingItems?: FloatingItemDef[];
}

/**
 * Type-safe helper to create an EditorExtension
 */
export function createExtension(extension: EditorExtension): EditorExtension {
  return extension;
}
