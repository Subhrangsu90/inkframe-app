import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
import { Editor } from '../src/editor';

const initial: StoredDoc = {
  schemaVersion: SCHEMA_VERSION,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
};

@Component({
  imports: [Editor],
  template: `<ink-editor [initialDoc]="doc" />`,
})
class Host {
  doc = initial;
}

describe('<ink-toolbar> focus', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const editor = fixture.debugElement.children[0].componentInstance as Editor;
    const view = (editor as any).svc.view;
    // jsdom only focuses elements with a tabindex.
    view.dom.tabIndex = 0;
    view.focus();
    expect(view.hasFocus()).toBe(true);
    const toolbar = fixture.nativeElement.querySelector('.ink-toolbar') as HTMLElement;
    const button = (selector: string) => toolbar.querySelector(selector) as HTMLButtonElement;
    return { fixture, view, toolbar, button };
  }

  async function chooseHeading2(fixture: { whenStable(): Promise<unknown> }) {
    await fixture.whenStable();
    const item = [...document.querySelectorAll<HTMLElement>('.mat-mdc-menu-item')].find((el) =>
      el.textContent?.includes('Heading 2'),
    )!;
    item.click();
    await fixture.whenStable();
  }

  it('a press on the toolbar does not take focus from the document', async () => {
    const { toolbar, button } = await setup();
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button('[aria-label="Bold"]').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    expect(toolbar.contains(document.activeElement)).toBe(false);
  });

  it('a menu opened by a tap while typing returns focus to the document', async () => {
    const { fixture, view, button } = await setup();
    const trigger = button('.ink-tb-block-btn');
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    trigger.click();
    await chooseHeading2(fixture);

    expect(view.state.doc.firstChild.type.name).toBe('heading');
    expect(view.hasFocus()).toBe(true);
  });

  it('a menu opened from the keyboard returns focus to its button', async () => {
    const { fixture, view, button } = await setup();
    const trigger = button('.ink-tb-block-btn');
    trigger.focus();
    trigger.click(); // Enter on a focused button
    await chooseHeading2(fixture);

    expect(view.state.doc.firstChild.type.name).toBe('heading');
    expect(document.activeElement).toBe(trigger);
  });
});
