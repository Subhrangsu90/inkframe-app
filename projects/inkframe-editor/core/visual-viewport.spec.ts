import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { VisualViewportTracker, keyboardInset } from './visual-viewport';

interface Viewport {
  /** The layout viewport (window.innerHeight / innerWidth). */
  innerHeight: number;
  innerWidth: number;
  /** The visual viewport: what is visible above an overlaid keyboard. */
  height: number;
  offsetTop: number;
  scale: number;
  touch: boolean;
}

const root = document.documentElement;
const originals = new Map<string, PropertyDescriptor | undefined>();

/** Replaces the window's viewport sizes and touch-screen media query for a test. */
function viewport(init: Partial<Viewport> = {}): (change: Partial<Viewport>) => void {
  const state: Viewport = {
    innerHeight: 800,
    innerWidth: 390,
    height: 800,
    offsetTop: 0,
    scale: 1,
    touch: true,
    ...init,
  };
  const vv = new EventTarget() as EventTarget & Record<string, number>;
  for (const key of ['height', 'offsetTop', 'scale'] as const) {
    Object.defineProperty(vv, key, { get: () => state[key] });
  }
  const define = (name: string, get: () => unknown) => {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(window, name));
    Object.defineProperty(window, name, { configurable: true, get });
  };
  define('visualViewport', () => vv);
  define('innerHeight', () => state.innerHeight);
  define('innerWidth', () => state.innerWidth);
  define('matchMedia', () => (query: string) => ({
    matches: state.touch && query.includes('coarse'),
    addEventListener() {},
  }));
  return (change) => Object.assign(state, change);
}

function focusTextField(): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  document.body.append(field);
  field.focus();
  return field;
}

const inset = () => root.style.getPropertyValue('--ink-keyboard-inset');

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else delete (window as unknown as Record<string, unknown>)[name];
  }
  originals.clear();
  root.removeAttribute('data-ink-keyboard');
  root.style.removeProperty('--ink-keyboard-inset');
  root.style.removeProperty('--ink-viewport-offset-top');
  document.body.innerHTML = '';
});

describe('keyboardInset', () => {
  it('is the part of the page an overlaid keyboard covers', () => {
    viewport({ innerHeight: 800, height: 470 });
    expect(keyboardInset(window)).toBe(330);
  });

  it('is 0 without a keyboard, when zoomed in, and without the Visual Viewport API', () => {
    viewport({ innerHeight: 800, height: 800 });
    expect(keyboardInset(window)).toBe(0);

    viewport({ innerHeight: 800, height: 400, scale: 2 });
    expect(keyboardInset(window)).toBe(0);

    viewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    expect(keyboardInset(window)).toBe(0);
  });
});

describe('VisualViewportTracker', () => {
  it('publishes the covered height and marks the keyboard open while typing', () => {
    const set = viewport();
    focusTextField();
    const tracker = TestBed.inject(VisualViewportTracker);
    tracker.start();
    expect(root.hasAttribute('data-ink-keyboard')).toBe(false);

    set({ height: 470, offsetTop: 40 });
    tracker.update();
    expect(inset()).toBe('330px');
    expect(root.style.getPropertyValue('--ink-viewport-offset-top')).toBe('40px');
    expect(root.getAttribute('data-ink-keyboard')).toBe('open');
    expect(tracker.keyboardOpen()).toBe(true);

    set({ height: 800, offsetTop: 0 });
    tracker.update();
    expect(inset()).toBe('0px');
    expect(root.style.getPropertyValue('--ink-viewport-offset-top')).toBe('0px');
    expect(root.hasAttribute('data-ink-keyboard')).toBe(false);
  });

  it('notices a keyboard that resizes the page instead of covering it', () => {
    const set = viewport();
    const field = focusTextField();
    const tracker = TestBed.inject(VisualViewportTracker);
    tracker.start();

    // Chrome on Android with interactive-widget=resizes-content: both viewports shrink.
    set({ innerHeight: 500, height: 500 });
    tracker.update();
    expect(tracker.keyboardInset()).toBe(0);
    expect(tracker.keyboardOpen()).toBe(true);

    field.blur();
    tracker.update();
    expect(tracker.keyboardOpen()).toBe(false);
  });

  it('takes a shorter window on a computer for a resize, not a keyboard', () => {
    const set = viewport({ touch: false });
    focusTextField();
    const tracker = TestBed.inject(VisualViewportTracker);
    tracker.start();

    set({ innerHeight: 500, height: 500 });
    tracker.update();
    expect(tracker.keyboardOpen()).toBe(false);
  });

  it('needs a text field with focus: buttons and checkboxes open no keyboard', () => {
    const set = viewport();
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.append(checkbox);
    checkbox.focus();
    const tracker = TestBed.inject(VisualViewportTracker);
    tracker.start();

    set({ height: 470 });
    tracker.update();
    expect(inset()).toBe('330px');
    expect(tracker.keyboardOpen()).toBe(false);
  });

  it('does nothing without the Visual Viewport API', () => {
    viewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    const tracker = TestBed.inject(VisualViewportTracker);
    tracker.start();
    expect(inset()).toBe('');
    expect(tracker.keyboardOpen()).toBe(false);
  });
});
