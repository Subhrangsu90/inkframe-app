import '@angular/compiler';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApplicationRef, EnvironmentInjector, Injector } from '@angular/core';
import { Slice } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { EditorService } from './editor-service';
import { DEFAULT_HIGHLIGHT_COLOR, schema as staticSchema } from './schema';
import {
  BoldExtension,
  DEFAULT_EXTENSIONS,
  HeadingExtension,
  HistoryExtension,
  ItalicExtension,
} from './default-extensions';
import { createExtension } from './extension-types';
import { taskItemRule } from './input-rules';
import { SCHEMA_VERSION, StoredDoc } from './migrations';
import { GOOGLE_DOCS_CLIPBOARD, IMAGE_ONLY_CLIPBOARD, WORD_CLIPBOARD } from './paste-cleanup.fixtures';

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

  function press(view: EditorView, key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      cancelable: true,
    });
    return !!view.someProp('handleKeyDown', (f: any) => f(view, event));
  }

  it('Tab indents a list item even though the table extension also binds Tab', () => {
    const view = mount({
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: ['one', 'two'].map((text) => ({
              type: 'list_item',
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            })),
          },
        ],
      },
    });
    select(10, 10); // in "two"
    expect(press(view, 'Tab')).toBe(true);
    const list = view.state.doc.firstChild!;
    expect(list.childCount).toBe(1);
    expect(list.firstChild!.lastChild!.type.name).toBe('bullet_list');

    expect(press(view, 'Tab', { shift: true })).toBe(true);
    expect(view.state.doc.firstChild!.childCount).toBe(2);
  });

  it('Tab still moves between table cells', () => {
    const view = mount({
      schemaVersion: SCHEMA_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: ['a', 'b'].map((text) => ({
                  type: 'table_cell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                })),
              },
            ],
          },
        ],
      },
    });
    select(4, 4); // in "a"
    expect(press(view, 'Tab')).toBe(true);
    expect(view.state.selection.from).toBeGreaterThan(7); // inside the second cell
  });

  it('highlights through commands and Mod-Alt-h, and tracks the current color', () => {
    const view = mount(paragraphDoc('hello world'));
    select(1, 6);
    svc.setHighlight('#bbf7d0');
    expect(svc.currentHighlight()).toBe('#bbf7d0');
    svc.removeHighlight();
    expect(svc.currentHighlight()).toBeNull();

    expect(press(view, 'h', { ctrl: true, alt: true })).toBe(true);
    expect(svc.currentHighlight()).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(view.state.doc.rangeHasMark(1, 6, view.state.schema.marks['highlight'])).toBe(true);
  });

  it('aligns through commands and shortcuts; headings and Enter keep the alignment', () => {
    const view = mount(paragraphDoc('hello'));
    expect(svc.textAlign()).toBe('left');
    svc.setTextAlign('center');
    expect(svc.textAlign()).toBe('center');

    expect(press(view, 'r', { ctrl: true, shift: true })).toBe(true);
    expect(svc.textAlign()).toBe('right');

    svc.heading(1);
    expect(view.state.doc.firstChild!.type.name).toBe('heading');
    expect(svc.textAlign()).toBe('right');

    select(6, 6);
    expect(press(view, 'Enter')).toBe(true);
    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).attrs['align']).toBe('right');

    expect(press(view, 'l', { ctrl: true, shift: true })).toBe(true);
    expect(svc.textAlign()).toBe('left');
  });

  it('the floating menu gets only custom items, not the ones it renders itself', () => {
    mount(paragraphDoc('x'));
    expect(svc.customFloatingItems()).toEqual([]);

    const custom = createExtension({
      name: 'shout',
      floatingItems: [{ id: 'shout', label: 'Shout', run: () => undefined }],
    });
    svc.setExtensions([...DEFAULT_EXTENSIONS, custom]);
    expect(svc.customFloatingItems().map((i) => i.id)).toEqual(['shout']);
  });

  it('find and replace: open with Mod-f, prefill from the selection, navigate, replace, close', () => {
    const view = mount(paragraphDoc('one fish two fish red fish'));
    expect(press(view, 'f', { ctrl: true })).toBe(true);
    expect(svc.searchOpen()).toBe(true);
    expect(svc.searchFocusRequests()).toBe(1);

    svc.setSearchQuery('fish');
    expect(svc.searchMatchCount()).toBe(3);
    expect(svc.searchCurrent()).toBe(0);
    svc.findNext();
    expect(svc.searchCurrent()).toBe(1);
    svc.findPrevious();
    svc.findPrevious();
    expect(svc.searchCurrent()).toBe(2);

    svc.replaceCurrent('cat');
    expect(view.state.doc.textContent).toBe('one fish two fish red cat');
    expect(svc.searchMatchCount()).toBe(2);

    svc.closeSearch();
    expect(svc.searchOpen()).toBe(false);
    expect(svc.searchMatchCount()).toBe(0); // highlights cleared

    select(1, 1);
    svc.openSearch(); // reopening searches for the previous text again
    expect(svc.searchQuery()).toBe('fish');
    expect(svc.replaceAll('cod')).toBe(2);
    expect(view.state.doc.textContent).toBe('one cod two cod red cat');

    svc.closeSearch();
    select(5, 8); // "cod"
    expect(press(view, 'h', { ctrl: true })).toBe(true);
    expect(svc.searchReplaceVisible()).toBe(true);
    expect(svc.searchQuery()).toBe('cod');
    expect(svc.searchMatchCount()).toBe(2);

    // Escape in the document closes the panel too, and does nothing once it is closed.
    expect(press(view, 'Escape')).toBe(true);
    expect(svc.searchOpen()).toBe(false);
    expect(press(view, 'Escape')).toBe(false);
  });

  it('switching to read-only closes find and replace', () => {
    mount(paragraphDoc('a b a'));
    svc.openSearch();
    svc.setSearchQuery('a');
    svc.setEditable(false);
    expect(svc.searchOpen()).toBe(false);
    expect(svc.searchMatchCount()).toBe(0);
  });

  it('counts words, characters and the words in the selection', () => {
    const view = mount(paragraphDoc('hello world'));
    expect(svc.stats()).toEqual({ words: 2, characters: 11, readingMinutes: 1 });
    expect(svc.selectionWords()).toBeNull();

    view.dispatch(view.state.tr.insertText(' again', 12));
    expect(svc.stats().words).toBe(3);

    select(1, 12);
    expect(svc.selectionWords()).toBe(2);
  });

  it('pastes text from Word instead of the picture of it that Word also puts on the clipboard', () => {
    const view = mount(paragraphDoc('x'));
    const insertImage = vi.fn();
    (svc as any).insertImage = insertImage;
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const pasteEvent = (html: string) =>
      ({
        clipboardData: { getData: (type: string) => (type === 'text/html' ? html : ''), files: [file] },
        preventDefault: vi.fn(),
      }) as unknown as ClipboardEvent;

    const fromWord = pasteEvent(WORD_CLIPBOARD);
    expect(view.someProp('handlePaste', (f: any) => f(view, fromWord, Slice.empty))).toBeFalsy();
    expect(insertImage).not.toHaveBeenCalled();

    const copiedImage = pasteEvent(IMAGE_ONLY_CLIPBOARD);
    expect(view.someProp('handlePaste', (f: any) => f(view, copiedImage, Slice.empty))).toBe(true);
    expect(insertImage).toHaveBeenCalledWith(file);
  });

  it('cleans pasted HTML through the paste cleanup extension', () => {
    const view = mount({ schemaVersion: SCHEMA_VERSION, doc: { type: 'doc', content: [{ type: 'paragraph' }] } });
    view.pasteHTML(GOOGLE_DOCS_CLIPBOARD, new Event('paste') as ClipboardEvent);
    const types = new Set<string>();
    view.state.doc.descendants((n) => {
      types.add(n.type.name);
      n.marks.forEach((m) => types.add(m.type.name));
    });
    expect(types.has('task_list')).toBe(true);
    expect(types.has('highlight')).toBe(true);
    expect(types.has('textColor')).toBe(false); // Google Docs' default black was dropped
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
