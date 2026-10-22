import { describe, it, expect, afterEach, vi } from 'vitest';
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { PageSetup, PageZoom, SCHEMA_VERSION, StoredDoc } from '@inkframe-ui/editor/core';
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
        [debounceMs]="debounce"
        [maxWaitMs]="maxWait"
        (changed)="emitted.push($event)"
      />
    }
  `,
})
class Host {
  readonly show = signal(true);
  readonly editor = viewChild<Editor>('ed');
  initial = docWith('first');
  debounce = 10000;
  maxWait: number | null = null;
  emitted: StoredDoc[] = [];
}

describe('<ink-editor> change emission', () => {
  async function setup(timing: { debounce?: number; maxWait?: number | null } = {}) {
    const fixture = TestBed.createComponent(Host);
    Object.assign(fixture.componentInstance, timing);
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

  it('with maxWaitMs, emits during steady typing too, not only once it pauses', async () => {
    const steady = async (maxWait: number | null) => {
      const { host, view } = await setup({ debounce: 1000, maxWait });
      vi.useFakeTimers();
      try {
        // 5 seconds of typing, never pausing for the debounce's second.
        for (let i = 0; i < 10; i++) {
          type(view, 'x');
          vi.advanceTimersByTime(500);
        }
        const whileTyping = host.emitted.length;
        vi.advanceTimersByTime(1000);
        return { whileTyping, after: host.emitted.length };
      } finally {
        vi.useRealTimers();
      }
    };
    expect(await steady(null)).toEqual({ whileTyping: 0, after: 1 });
    expect(await steady(3000)).toEqual({ whileTyping: 1, after: 2 });
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

@Component({
  imports: [Editor],
  template: `
    <ink-editor
      #ed
      [initialDoc]="initial"
      [showToolbar]="false"
      [(defaultPageSetup)]="defaultSetup"
    />
  `,
})
class PageSetupHost {
  readonly editor = viewChild<Editor>('ed');
  readonly defaultSetup = signal<PageSetup | null>(null);
  initial = docWith('text');
}

describe('<ink-editor> page setup', () => {
  async function open() {
    const fixture = TestBed.createComponent(PageSetupHost);
    await fixture.whenStable();
    const host = fixture.componentInstance;
    const editor = host.editor()!;
    const svc = (editor as any).svc;
    const statusButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.ink-status-layout',
    )!;
    expect(statusButton.textContent!.trim()).toBe('Pageless');
    statusButton.click();
    await fixture.whenStable();
    const dialog = document.querySelector<HTMLElement>('.ink-ps')!;
    expect(dialog).toBeTruthy();
    return { fixture, host, svc, dialog, statusButton };
  }

  const q = <T extends HTMLElement>(root: HTMLElement, selector: string) =>
    root.querySelector<T>(selector)!;

  function check(root: HTMLElement, selector: string) {
    const input = q<HTMLInputElement>(root, selector);
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  }

  function choosePages(dialog: HTMLElement) {
    check(dialog, 'input[name="ink-ps-layout"][value="pages"]');
  }

  const button = (dialog: HTMLElement, text: string) =>
    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)!;

  /** Shows a tab of the Pages settings: Page, Margins, or Header & footer. */
  function openTab(dialog: HTMLElement, label: string) {
    const tab = Array.from(dialog.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (t) => t.textContent!.trim() === label,
    )!;
    tab.click();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => c.remove()));

  it('applies Pages, paper and orientation as one undo step', async () => {
    const { fixture, svc, dialog, statusButton } = await open();
    expect(dialog.closest('[role="dialog"]')!.getAttribute('aria-labelledby')).toBe(
      'ink-page-setup-title',
    );

    choosePages(dialog);
    await fixture.whenStable();
    const paper = q<HTMLSelectElement>(dialog, '#ink-ps-paper');
    paper.value = 'letter';
    paper.dispatchEvent(new Event('change'));
    check(dialog, 'input[name="ink-ps-orientation"][value="landscape"]');
    await fixture.whenStable();
    expect(q(dialog, '.ink-ps-caption').textContent).toContain('Letter · Landscape');
    // Letter shows its margins in inches.
    openTab(dialog, 'Margins');
    await fixture.whenStable();
    expect(q(dialog, '.ink-ps-unit').textContent).toBe('in');

    button(dialog, 'Apply').click();
    await fixture.whenStable();

    expect(document.querySelector('.ink-ps')).toBeNull();
    expect(svc.pageSetup()).toMatchObject({
      layout: 'pages',
      paper: 'letter',
      orientation: 'landscape',
    });
    expect(statusButton.textContent!.trim()).toBe('Letter · Landscape');
    // The canvas shows the sheet at the turned paper size.
    const canvas = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.ink-canvas',
    )!;
    expect(canvas.dataset['inkLayout']).toBe('pages');
    expect(canvas.style.getPropertyValue('--ink-page-width')).toBe('279.4mm');
    expect(canvas.style.getPropertyValue('--ink-page-height')).toBe('215.9mm');

    svc.undo();
    await fixture.whenStable();
    expect(svc.storedPageSetup()).toBeNull();
    expect(canvas.dataset['inkLayout']).toBe('pageless');
  });

  it('Cancel, and Apply without changes, leave the document as it is', async () => {
    const { fixture, svc, dialog } = await open();
    choosePages(dialog);
    button(dialog, 'Cancel').click();
    await fixture.whenStable();
    expect(svc.storedPageSetup()).toBeNull();

    q<HTMLButtonElement>(fixture.nativeElement, '.ink-status-layout').click();
    await fixture.whenStable();
    button(document.querySelector('.ink-ps')!, 'Apply').click();
    await fixture.whenStable();
    expect(svc.storedPageSetup()).toBeNull();
    expect(svc.canUndo()).toBe(false);
  });

  it('sets a page color, and whether it prints, in either layout', async () => {
    const { fixture, svc, dialog } = await open();
    // Pageless here: the color does not need Pages.
    expect(dialog.querySelector('.ink-ps-check')).toBeNull();
    check(dialog, 'input[name="ink-ps-color"][value="sage"]');
    await fixture.whenStable();
    const print = q<HTMLInputElement>(dialog, '.ink-ps-check input');
    expect(print.checked).toBe(false);
    print.checked = true;
    print.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    button(dialog, 'Apply').click();
    await fixture.whenStable();

    expect(svc.pageSetup()).toMatchObject({ layout: 'pageless', color: 'sage', printColor: true });
    const canvas = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.ink-canvas',
    )!;
    expect(canvas.style.getPropertyValue('--ink-page-color-light')).toBe('#edf4ec');
  });

  it('sets the header, footer and page numbers', async () => {
    const { fixture, svc, dialog } = await open();
    choosePages(dialog);
    await fixture.whenStable();
    openTab(dialog, 'Header & footer');
    await fixture.whenStable();
    // With nothing set, there is no first page to leave out.
    expect(dialog.querySelector('.ink-ps-first-page')).toBeNull();

    const header = q<HTMLInputElement>(dialog, '#ink-ps-header');
    expect(header.labels![0].textContent!.trim()).toBe('Header');
    header.value = 'Quarterly report';
    header.dispatchEvent(new Event('input'));
    check(dialog, 'input[name="ink-ps-header-align"][value="center"]');
    check(dialog, 'input[name="ink-ps-numbers"][value="bottom"]');
    await fixture.whenStable();
    const format = q<HTMLSelectElement>(dialog, 'select[aria-label="Page number format"]');
    format.value = 'page-of';
    format.dispatchEvent(new Event('change'));
    check(dialog, 'input[name="ink-ps-numbers-align"][value="center"]');
    await fixture.whenStable();
    // The preview draws them where they go.
    const bands = dialog.querySelectorAll<HTMLElement>('.ink-ps-band');
    expect(Array.from(bands, (b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'Quarterly report',
      'Page 1 of 12',
    ]);
    const first = q<HTMLInputElement>(dialog, '.ink-ps-first-page input');
    expect(first.checked).toBe(true);
    first.checked = false;
    first.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    button(dialog, 'Apply').click();
    await fixture.whenStable();

    expect(svc.pageSetup()).toMatchObject({
      header: { text: 'Quarterly report', align: 'center' },
      footer: { text: '', align: 'left' },
      pageNumbers: { position: 'bottom', align: 'center', format: 'page-of' },
      firstPage: false,
    });
  });

  it('warns when a header sits in a margin too narrow for some printers', async () => {
    const { fixture, dialog } = await open();
    choosePages(dialog);
    await fixture.whenStable();
    openTab(dialog, 'Margins');
    await fixture.whenStable();
    check(dialog, 'input[name="ink-ps-margins"][value="narrow"]');
    await fixture.whenStable();
    openTab(dialog, 'Header & footer');
    await fixture.whenStable();
    expect(dialog.querySelector('.ink-ps-band-note')).toBeNull();

    const header = q<HTMLInputElement>(dialog, '#ink-ps-header');
    header.value = 'Draft';
    header.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(q(dialog, '.ink-ps-band-note').textContent).toMatch(/Under (1\.5 cm|0\.6 in)/);

    // The Margins tab warns too, where the margins are changed.
    openTab(dialog, 'Margins');
    await fixture.whenStable();
    expect(q(dialog, '.ink-ps-margin-note').textContent).toMatch(/Under (1\.5 cm|0\.6 in)/);
    check(dialog, 'input[name="ink-ps-margins"][value="normal"]');
    await fixture.whenStable();
    expect(dialog.querySelector('.ink-ps-margin-note')).toBeNull();
    openTab(dialog, 'Header & footer');
    await fixture.whenStable();
    expect(dialog.querySelector('.ink-ps-band-note')).toBeNull();
  });

  it('refuses margins that leave less than 5 cm for the text', async () => {
    const { fixture, svc, dialog } = await open();
    choosePages(dialog);
    await fixture.whenStable();
    const paper = q<HTMLSelectElement>(dialog, '#ink-ps-paper');
    paper.value = 'a4';
    paper.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    openTab(dialog, 'Margins');
    await fixture.whenStable();
    const left = dialog.querySelectorAll<HTMLInputElement>('.ink-ps-margin input')[2];
    left.value = '17';
    left.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(q(dialog, '.ink-ps-error').textContent).toContain('5 cm');
    expect(left.getAttribute('aria-invalid')).toBe('true');
    expect(button(dialog, 'Apply').disabled).toBe(true);
    // The tab shows the problem from the other tabs too.
    expect(dialog.querySelector('#ink-ps-tab-margins .ink-ps-tab-alert')).toBeTruthy();

    left.value = '2';
    left.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(dialog.querySelector('.ink-ps-error')).toBeNull();
    expect(dialog.querySelector('.ink-ps-tab-alert')).toBeNull();
    button(dialog, 'Apply').click();
    await fixture.whenStable();
    expect(svc.pageSetup().margins.left).toBe(20);
  });

  it('Set as default updates the bound default, which a document without setup starts from', async () => {
    const { fixture, host, dialog } = await open();
    choosePages(dialog);
    await fixture.whenStable();
    openTab(dialog, 'Margins');
    await fixture.whenStable();
    check(dialog, 'input[name="ink-ps-margins"][value="narrow"]');
    await fixture.whenStable();
    button(dialog, 'Set as default').click();
    await fixture.whenStable();

    expect(q(dialog, '[role="status"]').textContent).toContain('default for new documents');
    expect(host.defaultSetup()).toMatchObject({
      layout: 'pages',
      margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
    });
    button(dialog, 'Cancel').click();
    await fixture.whenStable();

    // The document is still Pageless; the dialog keeps that, with the default's margins.
    q<HTMLButtonElement>(fixture.nativeElement, '.ink-status-layout').click();
    await fixture.whenStable();
    const again = document.querySelector<HTMLElement>('.ink-ps')!;
    expect(q<HTMLInputElement>(again, 'input[value="pageless"]').checked).toBe(true);
    choosePages(again);
    await fixture.whenStable();
    openTab(again, 'Margins');
    await fixture.whenStable();
    expect(q<HTMLInputElement>(again, 'input[value="narrow"]').checked).toBe(true);
  });

  it('opens at the header or footer, and moves between tabs with the arrow keys', async () => {
    const fixture = TestBed.createComponent(PageSetupHost);
    fixture.componentInstance.initial = {
      ...docWith('text'),
      doc: { ...(docWith('text').doc as object), attrs: { page: { layout: 'pages' } } },
    };
    await fixture.whenStable();
    fixture.componentInstance.editor()!.openPageSetup('footer');
    await fixture.whenStable();
    const dialog = document.querySelector<HTMLElement>('.ink-ps')!;
    const selected = () => dialog.querySelector('[role="tab"][aria-selected="true"]')!;

    expect(selected().textContent!.trim()).toBe('Header & footer');
    expect(dialog.querySelector('#ink-ps-footer')).toBeTruthy();
    expect(q(dialog, '[role="tabpanel"]').getAttribute('aria-labelledby')).toBe(selected().id);

    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(selected().textContent!.trim()).toBe('Page');
    expect(document.activeElement).toBe(selected());
    selected().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(selected().textContent!.trim()).toBe('Header & footer');
    // Only the selected tab is in the tab order.
    expect(
      Array.from(dialog.querySelectorAll('[role="tab"]'), (t) => t.getAttribute('tabindex')),
    ).toEqual(['-1', '-1', '0']);
  });
});

@Component({
  imports: [Editor],
  template: `
    <ink-editor
      #ed
      [initialDoc]="initial"
      [showToolbar]="false"
      [showRuler]="showRuler()"
      [editable]="editable()"
    />
  `,
})
class RulerHost {
  readonly editor = viewChild<Editor>('ed');
  readonly showRuler = signal(true);
  readonly editable = signal(true);
  initial: StoredDoc = {
    schemaVersion: SCHEMA_VERSION,
    doc: {
      type: 'doc',
      attrs: { page: { layout: 'pages', paper: 'a4' } },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'text' }] }],
    },
  };
}

describe('<ink-editor> ruler', () => {
  async function setup() {
    const fixture = TestBed.createComponent(RulerHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const svc = (fixture.componentInstance.editor() as any).svc;
    const handles = () => Array.from(el.querySelectorAll<HTMLElement>('ink-ruler [role="slider"]'));
    return { fixture, el, svc, handles };
  }

  const press = (target: HTMLElement, key: string, shiftKey = false) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));

  it('has a slider for each side margin, in the paper units', async () => {
    const { handles } = await setup();
    const [left, right] = handles();
    expect(left.getAttribute('aria-label')).toBe('Left margin');
    expect(right.getAttribute('aria-label')).toBe('Right margin');
    expect(left.getAttribute('aria-valuetext')).toBe('2.54 cm');
    expect(left.getAttribute('aria-valuemin')).toBe('0');
    // 21 cm of paper, less the right margin and 5 cm of text.
    expect(left.getAttribute('aria-valuemax')).toBe('13.46');
    expect(left.tabIndex).toBe(0);
  });

  it('moves the margins from the keyboard, the way each handle looks', async () => {
    const { fixture, svc, handles } = await setup();
    const [left, right] = handles();

    press(left, 'ArrowRight');
    await fixture.whenStable();
    expect(svc.pageSetup().margins.left).toBe(26.4);
    press(left, 'ArrowRight', true);
    await fixture.whenStable();
    expect(svc.pageSetup().margins.left).toBe(36.4);
    expect(handles()[0].getAttribute('aria-valuetext')).toBe('3.64 cm');

    // Right moves the right handle right: a smaller right margin.
    press(right, 'ArrowRight');
    await fixture.whenStable();
    expect(svc.pageSetup().margins.right).toBe(24.4);
    press(right, 'Home');
    await fixture.whenStable();
    expect(svc.pageSetup().margins.right).toBe(0);
  });

  it('is hidden when turned off, and while previewing', async () => {
    const { fixture, el } = await setup();
    expect(el.querySelector('ink-ruler')).not.toBeNull();
    fixture.componentInstance.showRuler.set(false);
    await fixture.whenStable();
    expect(el.querySelector('ink-ruler')).toBeNull();
    fixture.componentInstance.showRuler.set(true);
    fixture.componentInstance.editable.set(false);
    await fixture.whenStable();
    expect(el.querySelector('ink-ruler')).toBeNull();
  });
});

@Component({
  imports: [Editor],
  template: `<ink-editor #ed [initialDoc]="initial" [showToolbar]="false" [(zoom)]="zoom" />`,
})
class ZoomHost {
  readonly editor = viewChild<Editor>('ed');
  readonly zoom = signal<PageZoom>('auto');
  initial: StoredDoc = {
    schemaVersion: SCHEMA_VERSION,
    doc: {
      type: 'doc',
      attrs: { page: { layout: 'pages', paper: 'a4' } },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'text' }] }],
    },
  };
}

describe('<ink-editor> zoom', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => c.remove()));

  it('zooms the Pages sheet from the bound zoom, and the status bar sets it', async () => {
    const fixture = TestBed.createComponent(ZoomHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const canvas = el.querySelector<HTMLElement>('.ink-canvas')!;
    const button = el.querySelector<HTMLButtonElement>('.ink-status-zoom')!;
    expect(button.textContent!.trim()).toBe('100%');
    expect(canvas.style.getPropertyValue('--ink-zoom')).toBe('1');

    fixture.componentInstance.zoom.set(1.25);
    await fixture.whenStable();
    expect(canvas.style.getPropertyValue('--ink-zoom')).toBe('1.25');
    expect(button.textContent!.trim()).toBe('125%');

    button.click();
    await fixture.whenStable();
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('.ink-zoom-menu [role="menuitemradio"]'),
    );
    expect(items.map((i) => i.textContent!.trim())).toEqual([
      'Fit width',
      '50%',
      '75%',
      '100%',
      '125%',
      '150%',
      '200%',
    ]);
    expect(items[4].getAttribute('aria-checked')).toBe('true');
    items[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.zoom()).toBe(0.5);
    expect(canvas.style.getPropertyValue('--ink-zoom')).toBe('0.5');
  });

  it('has no zoom in Pageless, which fills the editor', async () => {
    const fixture = TestBed.createComponent(ZoomHost);
    fixture.componentInstance.initial = docWith('pageless');
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.ink-status-zoom')).toBeNull();
    expect(el.querySelector<HTMLElement>('.ink-canvas')!.style.getPropertyValue('--ink-zoom')).toBe(
      '1',
    );
  });
});
