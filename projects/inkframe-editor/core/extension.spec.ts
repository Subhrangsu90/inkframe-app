import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  ExtensionManager,
  createExtension,
  DEFAULT_EXTENSIONS,
  BoldExtension,
  ItalicExtension,
  HeadingExtension,
  TableExtension,
  HistoryExtension,
  BulletListExtension,
} from './index';

describe('Modular Extension Architecture (TipTap-style)', () => {
  const dummyService = {
    envInjector: null,
    appReference: null,
  } as any;

  const dummyHooks = {
    onFloatingMenu: () => {},
    onSlashMenu: () => {},
    onTableMenu: () => {},
    onSlashKeyDown: () => false,
  } as any;

  it('compiles full schema when using DEFAULT_EXTENSIONS (StarterKit)', () => {
    const manager = new ExtensionManager(DEFAULT_EXTENSIONS, dummyService, dummyHooks);
    const schema = manager.schema;

    // Standard baseline nodes
    expect(schema.nodes['doc']).toBeDefined();
    expect(schema.nodes['paragraph']).toBeDefined();
    expect(schema.nodes['text']).toBeDefined();

    // Extension nodes
    expect(schema.nodes['heading']).toBeDefined();
    expect(schema.nodes['table']).toBeDefined();
    expect(schema.nodes['callout']).toBeDefined();
    expect(schema.nodes['code_block']).toBeDefined();
    expect(schema.nodes['task_list']).toBeDefined();

    // Extension marks
    expect(schema.marks['strong']).toBeDefined();
    expect(schema.marks['em']).toBeDefined();
    expect(schema.marks['underline']).toBeDefined();
    expect(schema.marks['strikethrough']).toBeDefined();
    expect(schema.marks['code']).toBeDefined();
    expect(schema.marks['textColor']).toBeDefined();

    expect(manager.has('bold')).toBe(true);
    expect(manager.has('table')).toBe(true);
    expect(manager.has('heading')).toBe(true);
  });

  it('compiles a minimal custom schema when picking tools one by one', () => {
    // Only Bold and Heading extensions
    const manager = new ExtensionManager(
      [BoldExtension, HeadingExtension],
      dummyService,
      dummyHooks,
    );
    const schema = manager.schema;

    // Has baseline + selected tools
    expect(schema.nodes['doc']).toBeDefined();
    expect(schema.nodes['paragraph']).toBeDefined();
    expect(schema.nodes['heading']).toBeDefined();
    expect(schema.marks['strong']).toBeDefined();

    // Does NOT have excluded tools
    expect(schema.nodes['table']).toBeUndefined();
    expect(schema.nodes['callout']).toBeUndefined();
    expect(schema.marks['underline']).toBeUndefined();
    expect(schema.marks['strikethrough']).toBeUndefined();

    expect(manager.has('bold')).toBe(true);
    expect(manager.has('heading')).toBe(true);
    expect(manager.has('table')).toBe(false);
    expect(manager.has('callout')).toBe(false);
  });

  it('filters slash commands dynamically based on registered extensions', () => {
    const minimalManager = new ExtensionManager(
      [HeadingExtension],
      dummyService,
      dummyHooks,
    );
    const slashItems = minimalManager.getSlashItems();

    expect(slashItems.length).toBe(3);
    expect(slashItems.map((i) => i.id)).toEqual(['h1', 'h2', 'h3']);

    const fullManager = new ExtensionManager(
      DEFAULT_EXTENSIONS,
      dummyService,
      dummyHooks,
    );
    const fullSlashItems = fullManager.getSlashItems();

    expect(fullSlashItems.some((i) => i.id === 'tbl')).toBe(true);
    expect(fullSlashItems.some((i) => i.id === 'cl')).toBe(true);
    expect(fullSlashItems.some((i) => i.id === 'img')).toBe(true);
  });

  it('allows registering custom extensions with custom slash and toolbar items', () => {
    let customToolRan = false;
    let customSlashRan = false;

    const MyPlugin = createExtension({
      name: 'super_feature',
      marks: {
        highlight: {
          parseDOM: [{ tag: 'mark' }],
          toDOM: () => ['mark', 0],
        },
      },
      slashItems: [
        {
          id: 'super_command',
          label: 'Super Feature',
          hint: 'Insert custom content',
          icon: 'stars',
          keywords: ['super', 'custom'],
          run: () => {
            customSlashRan = true;
          },
        },
      ],
      toolbarItems: [
        {
          id: 'super_btn',
          label: 'Super',
          icon: 'stars',
          tooltip: 'Super Feature Tool',
          run: () => {
            customToolRan = true;
          },
        },
      ],
    });

    const manager = new ExtensionManager([MyPlugin], dummyService, dummyHooks);
    const schema = manager.schema;

    expect(schema.marks['highlight']).toBeDefined();
    expect(manager.has('super_feature')).toBe(true);

    const slashItems = manager.getSlashItems();
    expect(slashItems.length).toBe(1);
    expect(slashItems[0].id).toBe('super_command');
    slashItems[0].run({} as any);
    expect(customSlashRan).toBe(true);

    const toolbarItems = manager.getToolbarItems();
    expect(toolbarItems.length).toBe(1);
    expect(toolbarItems[0].id).toBe('super_btn');
    toolbarItems[0].run({} as any);
    expect(customToolRan).toBe(true);
  });

  it('compiles ProseMirror plugins and keymaps properly for registered extensions', () => {
    const manager = new ExtensionManager(
      [HistoryExtension, BoldExtension, ItalicExtension, BulletListExtension],
      dummyService,
      dummyHooks,
    );

    const plugins = manager.buildPlugins();
    expect(plugins.length).toBeGreaterThan(0);
  });
});
