import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type AppTheme = 'dark' | 'light';

/**
 * Where a theme change's reveal starts: the control that was used (or the
 * event from it, typically `$event` of a click), or a point in the viewport.
 */
export type ThemeTransitionOrigin = Element | Event | { x: number; y: number };

const REVEAL_DURATION_MS = 560;
const REVEAL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const SWITCHING_CLASS = 'ink-theme-switching';

let activeReveal: ViewTransition | null = null;

/**
 * Runs `update`, which must switch the theme synchronously, and reveals the
 * new theme as a circle growing from `origin` over the old one.
 *
 * Switches instantly when there is no origin, the browser lacks the View
 * Transitions API, or the user prefers reduced motion. Relies on the
 * `.ink-theme-switching` rules in the editor stylesheet.
 */
export function revealThemeChange(
  doc: Document,
  origin: ThemeTransitionOrigin | undefined,
  update: () => void,
): void {
  const win = doc.defaultView;
  const point = origin && win && typeof doc.startViewTransition === 'function' ? originPoint(origin) : null;
  if (!point || win!.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }

  const root = doc.documentElement;
  root.classList.add(SWITCHING_CLASS);
  const transition = doc.startViewTransition(update);
  activeReveal = transition;

  transition.ready
    .then(() => {
      const { x, y } = point;
      const radius = Math.hypot(Math.max(x, win!.innerWidth - x), Math.max(y, win!.innerHeight - y));
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_DURATION_MS, easing: REVEAL_EASING, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {
      // Skipped (another switch started, or the tab was hidden): the theme is already applied.
    });

  const cleanup = () => {
    if (activeReveal !== transition) return;
    activeReveal = null;
    root.classList.remove(SWITCHING_CLASS);
  };
  transition.finished.then(cleanup, cleanup);
}

function originPoint(origin: ThemeTransitionOrigin): { x: number; y: number } | null {
  let el: Element | null;
  if (origin instanceof Event) {
    // Prefer the control's center over the pointer: keyboard clicks report (0, 0).
    const { currentTarget, target } = origin;
    el = currentTarget instanceof Element ? currentTarget : target instanceof Element ? target : null;
  } else if (origin instanceof Element) {
    el = origin;
  } else {
    return origin;
  }
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

@Injectable({
  providedIn: 'root',
})
export class Theme {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<AppTheme>('dark');

  constructor() {
    // Check localStorage if in browser environment
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('inkframe-theme') as AppTheme | null;
        if (saved === 'dark' || saved === 'light') {
          this.theme.set(saved);
        }
      } catch {
        // Fallback to default dark
      }
    }

    // Reactively apply theme to DOM attributes and classes
    effect(() => {
      const current = this.theme();
      this.applyTheme(current);
    });
  }

  /**
   * Switches between dark and light. Pass the control or its click event as
   * `origin` to reveal the new theme as a circle growing from it.
   */
  toggleTheme(origin?: ThemeTransitionOrigin): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next, origin);
  }

  setTheme(theme: AppTheme, origin?: ThemeTransitionOrigin): void {
    if (theme !== this.theme()) {
      // Apply to the DOM synchronously: the reveal snapshots the page right after `update`.
      revealThemeChange(this.document, origin, () => {
        this.theme.set(theme);
        this.applyTheme(theme);
      });
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('inkframe-theme', theme);
      } catch {
        // Ignore storage exceptions
      }
    }
  }

  private applyTheme(theme: AppTheme): void {
    const root = this.document.documentElement;
    const body = this.document.body;
    if (root) {
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
      root.classList.toggle('dark', theme === 'dark');
      if (theme === 'light') {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
      } else {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
      }
    }
    if (body) {
      body.setAttribute('data-theme', theme);
      body.style.colorScheme = theme;
      body.classList.toggle('dark', theme === 'dark');
      if (theme === 'light') {
        body.classList.add('theme-light');
        body.classList.remove('theme-dark');
      } else {
        body.classList.add('theme-dark');
        body.classList.remove('theme-light');
      }
    }
  }
}

// Backward compatibility alias
export { Theme as ThemeService };
