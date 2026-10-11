import '@angular/compiler';
import { describe, it, expect, afterEach } from 'vitest';
import { ApplicationRef, EnvironmentInjector, Injector } from '@angular/core';
import { TextSelection } from 'prosemirror-state';
import { EditorService } from './editor-service';
import { schema as staticSchema } from './schema';
import {
  BoldExtension,
  DEFAULT_EXTENSIONS,
  HeadingExtension,
  HistoryExtension,
  ItalicExtension,
} from './default-extensions';
import { taskItemRule } from './input-rules';
import { SCHEMA_VERSION, StoredDoc } from './migrations';

function createService(): EditorService {
  const injector = Injector.create({
    providers: [
      EditorService,
      { provide: EnvironmentInjector, useValue: {} },
      { provide: ApplicationRef, useValue: {} },
    ],
  });
  return injector.get(EditorService);
}

const paragraphDoc = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

const tableDoc: StoredDoc = {
  schemaVersion: SCHEMA_VERSION,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_cell', content: [{ type: 'paragraph' }] }],
          },
        ],
      },
    ],
  },
};

describe('EditorService with the extension-built schema', () => {
  let svc: EditorService;

  function mount(doc: StoredDoc) {
    svc = createService();
    svc.mount(document.createElement('div'), { doc, extensions: DEFAULT_EXTENSIONS });
    return svc.view!;
  }

  function select(from: number, to: number) {
    const v = svc.view!;
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)));
  }

  afterEach(() => svc?.destroy());

  it('runs on a schema distinct from the static one', () => {
    const view = mount(paragraphDoc('hello'));
    expect(view.state.schema).not.toBe(staticSchema);
    expect(svc.schema).toBe(view.state.schema);
  });

  it('toggleBold applies a mark the editor recognises, and toggles it off again', () => {
    const view = mount(paragraphDoc('hello'));
    select(1, 6);
    svc.toggleBold();
    expect(view.state.doc.rangeHasMark(1, 6, view.state.schema.marks['strong'])).toBe(true);
    expect(svc.isBold()).toBe(true);

    svc.toggleBold();
    expect(view.state.doc.rangeHasMark(1, 6, view.state.schema.marks['strong'])).toBe(false);
    expect(svc.isBold()).toBe(false);
  });

  it('insertTable inserts a table instead of dropping it', () => {
    const view = mount(paragraphDoc('x'));
    svc.insertTable(2, 3);
    const table =
      view.state.doc.firstChild!.type.name === 'table'
        ? view.state.doc.firstChild!
        : view.state.doc.child(1);
    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(2);
    expect(table.firstChild!.childCount).toBe(3);
  });

  it('insertDivider, heading and setLink produce nodes and marks from the live schema', () => {
    const view = mount(paragraphDoc('hello'));
    svc.heading(2);
    expect(view.state.doc.firstChild!.type).toBe(view.state.schema.nodes['heading']);

    select(1, 6);
    expect(svc.setLink('https://example.com')).toBe(true);
    expect(view.state.doc.rangeHasMark(1, 6, view.state.schema.marks['link'])).toBe(true);

    svc.insertDivider();
    let hasRule = false;
    view.state.doc.descendants((n) => {
      if (n.type === view.state.schema.nodes['horizontal_rule']) hasRule = true;
    });
    expect(hasRule).toBe(true);
  });

  it('taskItemRule wraps into the task list type of the state schema', () => {
    const view = mount(paragraphDoc('[ ] '));
    const state = view.state;
    const match = /^\s*\[([ xX]?)\]\s$/.exec('[ ] ')!;
    const tr = (taskItemRule() as any).handler(state, match, 1, 5);
    expect(tr).toBeTruthy();
    expect(tr.doc.firstChild!.type).toBe(state.schema.nodes['task_list']);
  });

  it('setExtensions reconfigures the mounted view (schema, plugins and toolbar state)', () => {
    const view = mount(paragraphDoc('hello'));
    svc.setExtensions([HistoryExtension, HeadingExtension, BoldExtension, ItalicExtension]);
    expect(svc.hasExtension('table')).toBe(false);
    expect(view.state.schema.nodes['table']).toBeUndefined();
    expect(view.state.doc.textContent).toBe('hello');

    // Commands for removed extensions are no-ops instead of crashing.
    expect(() => svc.insertTable()).not.toThrow();
    expect(view.state.doc.textContent).toBe('hello');
  });

  it('setExtensions keeps the previous extensions when the document needs them', () => {
    const view = mount(tableDoc);
    svc.setExtensions([HistoryExtension, HeadingExtension, BoldExtension]);
    expect(svc.extensions()).toBe(DEFAULT_EXTENSIONS);
    expect(svc.hasExtension('table')).toBe(true);
    expect(view.state.doc.firstChild!.type.name).toBe('table');
  });

  it('Mod-k requests the link editor instead of reaching the browser', () => {
    const view = mount(paragraphDoc('hello'));
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
    const handled = view.someProp('handleKeyDown', (f: any) => f(view, event));
    expect(handled).toBe(true);
    expect(svc.linkEditorRequests()).toBe(1);
  });

  it('setDoc throws on an unparseable document and leaves the current one in place', () => {
    const view = mount(paragraphDoc('keep me'));
    const bad: StoredDoc = {
      schemaVersion: SCHEMA_VERSION,
      doc: { type: 'doc', content: [{ type: 'no_such_node' }] },
    };
    expect(() => svc.setDoc(bad)).toThrow();
    expect(view.state.doc.textContent).toBe('keep me');
    expect((svc.getJSON().doc as any).content[0].content[0].text).toBe('keep me');
  });
});
