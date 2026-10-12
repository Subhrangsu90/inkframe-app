import { describe, it, expect } from 'vitest';
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
