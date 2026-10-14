import { NodeSpec, MarkSpec, Schema } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { Command, Plugin } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands } from 'prosemirror-commands';
import { inputRules, undoInputRule, InputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { NodeViewConstructor } from 'prosemirror-view';

import {
  EditorExtension,
  ExtensionContext,
  ToolbarItemDef,
  FloatingItemDef,
  SlashItem,
} from './extension-types';
import { EditorService } from './editor-service';
import { EditorHooks } from './editor-hooks';
import { menusPlugin } from './menus.plugin';
import { paragraph } from '../extensions/document/document-schema';
import { LIST_ITEM_CONTENT, LIST_LEAD_GROUP } from '../extensions/lists/list-schema';
import { listKeymap } from '../extensions/lists/list-commands';
import { listJoinPlugin } from '../extensions/lists/list-join.plugin';
import { listDragPlugin } from '../extensions/lists/list-drag.plugin';

export class ExtensionManager {
  readonly extensions: readonly EditorExtension[];
  private readonly nameSet: Set<string>;
  readonly schema: Schema;

  constructor(
    extensions: EditorExtension[],
    private readonly service: EditorService,
    private readonly hooks: EditorHooks,
  ) {
    this.extensions = extensions;
    this.nameSet = new Set(extensions.map((e) => e.name));
    this.schema = this.buildSchema();
  }

  has(name: string): boolean {
    return this.nameSet.has(name);
  }

  private buildSchema(): Schema {
    // 1. Gather nodes
    const nodeMap: Record<string, NodeSpec> = {
      doc: basicNodes.doc,
      paragraph,
      text: basicNodes.text,
      hard_break: basicNodes.hard_break,
    };

    for (const ext of this.extensions) {
      if (ext.nodes) {
        for (const [key, spec] of Object.entries(ext.nodes)) {
          nodeMap[key] = spec;
        }
      }
    }

    // 2. Gather marks
    const markMap: Record<string, MarkSpec> = {};
    for (const ext of this.extensions) {
      if (ext.marks) {
        for (const [key, spec] of Object.entries(ext.marks)) {
          markMap[key] = spec;
        }
      }
    }

    // 3. List items start with a block of the list_lead group (paragraphs and
    // headings). When an extension replaced those with specs outside the
    // group, items start with a paragraph instead.
    const hasLead = Object.values(nodeMap).some((spec) =>
      spec.group?.split(' ').includes(LIST_LEAD_GROUP),
    );
    if (!hasLead) {
      for (const name of ['list_item', 'task_item']) {
        if (nodeMap[name]?.content === LIST_ITEM_CONTENT) {
          nodeMap[name] = { ...nodeMap[name], content: 'paragraph block*' };
        }
      }
    }

    return new Schema({ nodes: nodeMap, marks: markMap });
  }

  createContext(): ExtensionContext {
    return {
      service: this.service,
      hooks: this.hooks,
      schema: this.schema,
    };
  }

  buildPlugins(): Plugin[] {
    const ctx = this.createContext();
    const plugins: Plugin[] = [];

    // 1. Core coordination plugins
    plugins.push(menusPlugin(this.hooks));

    // 2. Extension Input Rules
    const allInputRules: InputRule[] = [];
    for (const ext of this.extensions) {
      if (ext.inputRules) {
        allInputRules.push(...ext.inputRules(ctx));
      }
    }
    if (allInputRules.length > 0) {
      plugins.push(inputRules({ rules: allInputRules }));
      plugins.push(keymap({ Backspace: undoInputRule }));
    }

    // 3. Extension Keymaps
    const combinedKeymap: Record<string, Command> = {};

    // List keys (Enter, Tab, Backspace, ...) act on the innermost list item at
    // the cursor and return false outside lists, so they come first.
    const hasListItems = !!(this.schema.nodes['list_item'] || this.schema.nodes['task_item']);
    if (hasListItems) Object.assign(combinedKeymap, listKeymap());

    // Merge each extension's keymap. When several bind the same key, they run
    // in order until one handles it (e.g. Tab indents a list item, otherwise
    // moves to the next table cell).
    for (const ext of this.extensions) {
      if (ext.keymaps) {
        for (const [key, command] of Object.entries(ext.keymaps(ctx))) {
          const existing = combinedKeymap[key];
          combinedKeymap[key] = existing ? chainCommands(existing, command) : command;
        }
      }
    }

    plugins.push(keymap(combinedKeymap));
    plugins.push(keymap(baseKeymap));

    // 4. Cursor plugins (the drop cursor is styled by the .ink-drop-cursor class)
    plugins.push(dropCursor({ color: false, width: 2, class: 'ink-drop-cursor' }));
    plugins.push(gapCursor());

    // Lists: joining adjacent lists after edits, and dragging items.
    if (hasListItems) plugins.push(listJoinPlugin(), listDragPlugin());

    // 5. Extension-specific ProseMirror plugins
    for (const ext of this.extensions) {
      if (ext.plugins) {
        plugins.push(...ext.plugins(ctx));
      }
    }

    return plugins;
  }

  buildNodeViews(): Record<string, NodeViewConstructor> {
    const ctx = this.createContext();
    const views: Record<string, NodeViewConstructor> = {};
    for (const ext of this.extensions) {
      if (ext.nodeViews) {
        const extViews = ext.nodeViews(ctx);
        Object.assign(views, extViews);
      }
    }
    return views;
  }

  getSlashItems(): SlashItem[] {
    const items: SlashItem[] = [];
    for (const ext of this.extensions) {
      if (ext.slashItems) {
        items.push(...ext.slashItems);
      }
    }
    return items;
  }

  getToolbarItems(): ToolbarItemDef[] {
    const items: ToolbarItemDef[] = [];
    for (const ext of this.extensions) {
      if (ext.toolbarItems) {
        items.push(...ext.toolbarItems);
      }
    }
    return items;
  }

  getFloatingItems(): FloatingItemDef[] {
    const items: FloatingItemDef[] = [];
    for (const ext of this.extensions) {
      if (ext.floatingItems) {
        items.push(...ext.floatingItems);
      }
    }
    return items;
  }
}
