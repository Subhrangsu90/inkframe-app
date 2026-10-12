import { NodeSpec, MarkSpec, Schema } from 'prosemirror-model';
import { nodes as basicNodes } from 'prosemirror-schema-basic';
import { addListNodes, splitListItem, sinkListItem, liftListItem } from 'prosemirror-schema-list';
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
} from './extension-types';
import { EditorService } from './editor-service';
import { EditorHooks } from './editor-hooks';
import { SlashItem } from './slash-items';
import { menusPlugin } from './menus.plugin';
import { paragraph } from './schema';

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

    let hasLists = false;

    for (const ext of this.extensions) {
      if (ext.name === 'bullet_list' || ext.name === 'ordered_list') {
        hasLists = true;
      }
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

    // 3. Construct Schema with list support if needed
    const baseSchema = new Schema({ nodes: nodeMap, marks: markMap });
    if (hasLists) {
      const nodesWithLists = addListNodes(baseSchema.spec.nodes, 'paragraph block*', 'block');
      return new Schema({ nodes: nodesWithLists, marks: markMap });
    }

    return baseSchema;
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

    // List items Enter/Tab behaviors if list item nodes are present
    const list_item = this.schema.nodes['list_item'];
    const task_item = this.schema.nodes['task_item'];

    if (list_item || task_item) {
      combinedKeymap['Enter'] = (state, dispatch) =>
        !!(task_item && splitListItem(task_item, { checked: false })(state, dispatch)) ||
        !!(task_item && liftListItem(task_item)(state, dispatch)) ||
        !!(list_item && splitListItem(list_item)(state, dispatch)) ||
        !!(list_item && liftListItem(list_item)(state, dispatch));

      combinedKeymap['Tab'] = (state, dispatch) =>
        !!(task_item && sinkListItem(task_item)(state, dispatch)) ||
        !!(list_item && sinkListItem(list_item)(state, dispatch));

      combinedKeymap['Shift-Tab'] = (state, dispatch) =>
        !!(task_item && liftListItem(task_item)(state, dispatch)) ||
        !!(list_item && liftListItem(list_item)(state, dispatch));
    }

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

    // 4. Cursor plugins
    plugins.push(dropCursor());
    plugins.push(gapCursor());

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
