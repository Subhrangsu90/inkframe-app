import { describe, it, expect, vi, afterEach } from 'vitest';
import { revealThemeChange } from './theme';

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('revealThemeChange', () => {
  const root = document.documentElement;
  const doc = document as any;

  afterEach(() => {
    delete doc.startViewTransition;
    delete (root as any).animate;
    root.classList.remove('ink-theme-switching');
    document.body.innerHTML = '';
  });

  function button(): HTMLButtonElement {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => ({ left: 100, top: 20, width: 40, height: 30 }) as DOMRect;
    document.body.append(el);
    return el;
  }

  it('switches at once when the browser has no View Transitions', () => {
    const update = vi.fn();
    revealThemeChange(document, button(), update);
    expect(update).toHaveBeenCalledOnce();
    expect(root.classList.contains('ink-theme-switching')).toBe(false);
  });

  it('switches at once without an origin', () => {
    doc.startViewTransition = vi.fn();
    const update = vi.fn();
    revealThemeChange(document, undefined, update);
    expect(update).toHaveBeenCalledOnce();
    expect(doc.startViewTransition).not.toHaveBeenCalled();
  });

  it('grows the new theme from the center of the clicked control', async () => {
    const ready = deferred();
    const finished = deferred();
    doc.startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { ready: ready.promise, finished: finished.promise };
    });
    const animate = vi.fn();
    (root as any).animate = animate;
    const update = vi.fn();

    const el = button();
    const click = new MouseEvent('click');
    el.addEventListener('click', (e) => revealThemeChange(document, e, update));
    el.dispatchEvent(click);

    expect(update).toHaveBeenCalledOnce();
    expect(root.classList.contains('ink-theme-switching')).toBe(true);

    ready.resolve();
    await ready.promise;
    await Promise.resolve();
    const [keyframes, options] = animate.mock.calls[0];
    expect(keyframes.clipPath[0]).toBe('circle(0px at 120px 35px)');
    expect(keyframes.clipPath[1]).toMatch(/^circle\(\d+(\.\d+)?px at 120px 35px\)$/);
    expect(options.pseudoElement).toBe('::view-transition-new(root)');

    finished.resolve();
    await finished.promise;
    await Promise.resolve();
    expect(root.classList.contains('ink-theme-switching')).toBe(false);
  });

  it('respects prefers-reduced-motion', () => {
    doc.startViewTransition = vi.fn();
    const win = window as any;
    const original = win.matchMedia;
    win.matchMedia = (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' });
    try {
      const update = vi.fn();
      revealThemeChange(document, button(), update);
      expect(update).toHaveBeenCalledOnce();
      expect(doc.startViewTransition).not.toHaveBeenCalled();
    } finally {
      win.matchMedia = original;
    }
  });
});
