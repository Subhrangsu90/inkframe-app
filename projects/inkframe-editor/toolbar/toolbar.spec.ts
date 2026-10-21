import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { FONT_SIZES, MAX_FONT_SIZE, SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
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

  it('the font size box takes focus, to be typed in', async () => {
    const { toolbar } = await setup();
    const box = toolbar.querySelector('.ink-tb-size-input') as HTMLInputElement;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    box.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(false);
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

describe('<ink-toolbar> font, font size and line spacing', () => {
  // jsdom has no layout; the floating menu measures the selection. An empty rect hides it.
  const ownRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  beforeAll(() => {
    Range.prototype.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
  });
  afterAll(() => {
    if (ownRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', ownRect);
    else delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  });

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const editor = fixture.debugElement.children[0].componentInstance as Editor;
    const view = (editor as any).svc.view;
    view.dom.tabIndex = 0;
    view.focus();
    // Select "hi".
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    await fixture.whenStable();
    const toolbar = fixture.nativeElement.querySelector('.ink-toolbar') as HTMLElement;
    const box = toolbar.querySelector('.ink-tb-size-input') as HTMLInputElement;
    const markAttr = (name: string, attr: string) =>
      view.state.doc.firstChild.firstChild.marks.find((m: any) => m.type.name === name)?.attrs[
        attr
      ] ?? null;
    return { fixture, view, toolbar, box, markAttr };
  }

  async function chooseMenuItem(fixture: { whenStable(): Promise<unknown> }, label: string) {
    await fixture.whenStable();
    const item = [...document.querySelectorAll<HTMLElement>('.mat-mdc-menu-item')].find(
      (el) => el.textContent?.trim() === label,
    )!;
    item.click();
    await fixture.whenStable();
  }

  function type(box: HTMLInputElement, value: string, key: string) {
    box.value = value;
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  it('line spacing is its own button, with its own menu', async () => {
    const { fixture, view, toolbar } = await setup();
    const button = toolbar.querySelector('.ink-tb-spacing-btn') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Line spacing: Default');
    button.click();
    await chooseMenuItem(fixture, '1.5');

    expect(view.state.doc.firstChild.attrs['lineSpacing']).toBe(1.5);
    expect(button.getAttribute('aria-label')).toBe('Line spacing: 1.5');
    expect(button.classList).toContain('active');
  });

  it('the font menu sets the font of the selection, and names it', async () => {
    const { fixture, toolbar, markAttr } = await setup();
    const button = toolbar.querySelector('.ink-tb-font-btn') as HTMLButtonElement;
    expect(button.textContent).toContain('Sans');
    button.click();
    await chooseMenuItem(fixture, 'Georgia');

    expect(markAttr('fontFamily', 'font')).toBe('georgia');
    expect(button.textContent).toContain('Georgia');

    button.click();
    await chooseMenuItem(fixture, 'Default (Sans)');
    expect(markAttr('fontFamily', 'font')).toBeNull();
  });

  it('a size typed in the box applies on Enter, within the allowed range', async () => {
    const { fixture, view, box, markAttr } = await setup();
    box.focus();
    await fixture.whenStable();
    type(box, '22', 'Enter');
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(22);
    expect(view.hasFocus()).toBe(true);
    expect(box.value).toBe('22');

    box.focus();
    type(box, '500', 'Enter');
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(MAX_FONT_SIZE);
  });

  it('the box opens a list of sizes; arrows pick one and Escape changes nothing', async () => {
    const { fixture, view, box, markAttr } = await setup();
    box.focus();
    await fixture.whenStable();
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const options = [...document.querySelectorAll<HTMLElement>('.ink-size-option')];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'Default',
      ...FONT_SIZES.map(String),
    ]);

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBeNull();
    expect(view.hasFocus()).toBe(true);
    expect(box.getAttribute('aria-expanded')).toBe('false');

    box.focus();
    await fixture.whenStable();
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    await fixture.whenStable();
    expect(box.getAttribute('aria-activedescendant')).toMatch(/-2$/);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(FONT_SIZES[1]);
  });

  it('a size clicked in the list applies', async () => {
    const { fixture, box, markAttr } = await setup();
    box.focus();
    await fixture.whenStable();
    const option = [...document.querySelectorAll<HTMLElement>('.ink-size-option')].find(
      (o) => o.textContent?.trim() === '36',
    )!;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true); // the box keeps focus until the click
    option.click();
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(36);
  });

  it('− and + change the size by a pixel', async () => {
    const { fixture, toolbar, box, markAttr } = await setup();
    box.focus();
    type(box, '20', 'Enter');
    await fixture.whenStable();
    const [minus, plus] = toolbar.querySelectorAll<HTMLButtonElement>('.ink-tb-step-btn');
    plus.click();
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(21);
    minus.click();
    minus.click();
    await fixture.whenStable();
    expect(markAttr('fontSize', 'size')).toBe(19);
  });
});
