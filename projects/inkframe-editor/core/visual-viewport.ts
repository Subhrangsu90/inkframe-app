import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/** On-screen keyboards are taller than this; browser toolbars that slide away are shorter. */
const KEYBOARD_MIN_HEIGHT = 120;

/** Inputs that open an on-screen keyboard (not buttons, checkboxes, pickers and the like). */
const TEXT_INPUT =
  'textarea, input:not([type=button], [type=checkbox], [type=color], [type=file], [type=hidden], [type=image], [type=radio], [type=range], [type=reset], [type=submit])';

/**
 * The height of the page area an on-screen keyboard covers, in CSS pixels.
 *
 * Browsers that lay the keyboard over the page (Safari on iOS, and Chrome on
 * Android unless the page asks to be resized with
 * `interactive-widget=resizes-content`) shrink the visual viewport but not the
 * layout viewport. Browsers that resize the page leave nothing covered: 0.
 * Also 0 while the page is pinch-zoomed, when a small visual viewport means
 * zoom rather than a keyboard.
 */
export function keyboardInset(win: Window): number {
  const vv = win.visualViewport;
  if (!vv || vv.scale > 1.01) return 0;
  return Math.max(0, Math.round(win.innerHeight - vv.height));
}

/**
 * Follows the on-screen keyboard, so that toolbars and sheets can stay above
 * it. While started, it keeps these up to date on `<html>`:
 *
 * - `--ink-keyboard-inset`: the height the keyboard covers (see
 *   {@link keyboardInset}). Size a full-screen layout with
 *   `height: calc(100dvh - var(--ink-keyboard-inset, 0px))` and its bottom
 *   edge stays above the keyboard in every browser.
 * - `--ink-viewport-offset-top`: how far the browser has scrolled the visible
 *   area down the page to show the caret above a keyboard (Safari on iOS
 *   does this even when the page cannot scroll). Moving such a layout down by
 *   this much keeps its top edge in view.
 * - `data-ink-keyboard="open"` while a keyboard is showing, also in browsers
 *   that resize the page for it.
 */
@Injectable({ providedIn: 'root' })
export class VisualViewportTracker {
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  /** The tallest layout viewport seen at each width: the height without a keyboard. */
  private readonly fullHeight = new Map<number, number>();

  /** Height of the page area the keyboard covers, in CSS pixels. */
  readonly keyboardInset = signal(0);
  /** How far the visible area is scrolled down the page while the keyboard covers it. */
  readonly offsetTop = signal(0);
  /** Whether an on-screen keyboard is showing. */
  readonly keyboardOpen = signal(false);

  /** Starts following the keyboard. Does nothing on the server or when already started. */
  start(): void {
    const win = this.doc.defaultView;
    const vv = win?.visualViewport;
    if (this.started || !win || !vv) return;
    this.started = true;

    let frame = 0;
    const schedule = () => {
      frame ||= win.requestAnimationFrame(() => {
        frame = 0;
        this.update();
      });
    };
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    win.addEventListener('resize', schedule);
    this.doc.addEventListener('focusin', schedule);
    this.doc.addEventListener('focusout', schedule);
    this.destroyRef.onDestroy(() => {
      win.cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      win.removeEventListener('resize', schedule);
      this.doc.removeEventListener('focusin', schedule);
      this.doc.removeEventListener('focusout', schedule);
    });
    this.update();
  }

  /** Measures the viewport now. Runs by itself on every change once started. */
  update(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    const inset = keyboardInset(win);
    const offsetTop = inset > 0 ? Math.max(0, Math.round(win.visualViewport!.offsetTop)) : 0;

    const width = win.innerWidth;
    const fullHeight = Math.max(this.fullHeight.get(width) ?? 0, win.innerHeight);
    this.fullHeight.set(width, fullHeight);
    const shrunk = fullHeight - win.innerHeight;

    const open =
      this.isTouchScreen(win) &&
      this.textInputFocused() &&
      Math.max(inset, shrunk) > KEYBOARD_MIN_HEIGHT;

    const root = this.doc.documentElement;
    if (inset !== this.keyboardInset()) {
      root.style.setProperty('--ink-keyboard-inset', `${inset}px`);
      this.keyboardInset.set(inset);
    }
    if (offsetTop !== this.offsetTop()) {
      root.style.setProperty('--ink-viewport-offset-top', `${offsetTop}px`);
      this.offsetTop.set(offsetTop);
    }
    if (open !== this.keyboardOpen()) {
      if (open) root.setAttribute('data-ink-keyboard', 'open');
      else root.removeAttribute('data-ink-keyboard');
      this.keyboardOpen.set(open);
    }
  }

  private isTouchScreen(win: Window): boolean {
    return win.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  }

  private textInputFocused(): boolean {
    const el = this.doc.activeElement;
    return (
      !!el &&
      (!!el.closest('[contenteditable=""], [contenteditable="true"]') || el.matches(TEXT_INPUT))
    );
  }
}
