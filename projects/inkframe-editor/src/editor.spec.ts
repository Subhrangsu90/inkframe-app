import { describe, it, expect } from 'vitest';
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
import { Editor } from './editor';

const docWith = (text: string): StoredDoc => ({
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

const textOf = (stored: StoredDoc) => (stored.doc as any).content[0].content?.[0]?.text;

@Component({
  imports: [Editor],
  template: `
    @if (show()) {
      <ink-editor
        #ed
        [initialDoc]="initial"
        [showToolbar]="false"
        [debounceMs]="10000"
        (changed)="emitted.push($event)"
      />
    }
  `,
})
class Host {
  readonly show = signal(true);
  readonly editor = viewChild<Editor>('ed');
  initial = docWith('first');
  emitted: StoredDoc[] = [];
}

describe('<ink-editor> change emission', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const editor = host.editor()!;
    const view = (editor as any).svc.view;
    expect(view).toBeTruthy();
    return { fixture, host, editor, view };
  }

  function type(view: any, text: string) {
    view.dispatch(view.state.tr.insertText(text, view.state.doc.content.size - 1));
  }

  it('loadDoc emits pending edits of the previous document before replacing it', async () => {
    const { host, editor, view } = await setup();
    type(view, ' edited');
    expect(host.emitted).toHaveLength(0); // still debounced

    editor.loadDoc(docWith('second'));

    expect(host.emitted).toHaveLength(1);
    expect(textOf(host.emitted[0])).toBe('first edited');
    expect(view.state.doc.textContent).toBe('second');
  });

  it('flush is a no-op without pending changes', async () => {
    const { host, editor } = await setup();
    editor.flush();
    editor.loadDoc(docWith('second'));
    expect(host.emitted).toHaveLength(0);
  });

  it('flush() before destroying the editor emits the pending edits', async () => {
    const { fixture, host, editor, view } = await setup();
    type(view, ' unsaved');

    editor.flush(); // what the app's canDeactivate guard does
    host.show.set(false);
    await fixture.whenStable();

    expect(host.emitted).toHaveLength(1);
    expect(textOf(host.emitted[0])).toBe('first unsaved');
  });

  it('emits pending edits when the page is hidden or closed', async () => {
    const { host, view } = await setup();
    type(view, ' backgrounded');

    window.dispatchEvent(new Event('pagehide'));

    expect(host.emitted).toHaveLength(1);
    expect(textOf(host.emitted[0])).toBe('first backgrounded');
  });
});

describe('<ink-editor> status bar and find panel', () => {
  async function setup(text: string) {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const editor = fixture.componentInstance.editor()!;
    editor.loadDoc(docWith(text));
    await fixture.whenStable();
    const svc = (editor as any).svc;
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, svc, view: svc.view, el };
  }

  const statusItems = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.ink-status-item'), (item) => item.textContent!.trim());

  it('shows words, characters and reading time, and follows edits and the selection', async () => {
    const { fixture, view, el } = await setup('first');
    expect(statusItems(el)).toEqual(['1 word', '5 characters', '1 min read']);
    // Screen readers hear "1 word, 5 characters, 1 min read".
    expect(el.querySelector('.ink-status-bar')!.textContent).toContain(
      '1 word·, 5 characters·, 1 min read',
    );

    view.dispatch(view.state.tr.insertText(' and second', 6));
    await fixture.whenStable();
    expect(statusItems(el)).toEqual(['3 words', '16 characters', '1 min read']);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 10)));
    await fixture.whenStable();
    expect(statusItems(el)[0]).toBe('2 of 3 words');
  });

  it('opens the find panel with Mod-f, focuses it, counts matches and closes with Escape', async () => {
    const { fixture, svc, view, el } = await setup('ab ab ab');
    view.someProp('handleKeyDown', (f: any) =>
      f(view, new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true })),
    );
    await fixture.whenStable();

    const input = el.querySelector<HTMLInputElement>('.ink-find-input')!;
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);

    input.value = 'ab';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.ink-find-count')!.textContent).toBe('1 of 3');
    expect(el.querySelectorAll('.ink-search-match')).toHaveLength(3);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('.ink-find-count')!.textContent).toBe('2 of 3');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(svc.searchOpen()).toBe(false);
    expect(el.querySelector('.ink-find')).toBeNull();
    expect(el.querySelectorAll('.ink-search-match')).toHaveLength(0);
  });
});
