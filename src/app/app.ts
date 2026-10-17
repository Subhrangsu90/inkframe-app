import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToastContainerComponent, ConfirmDialogComponent } from './shared/ui';
import { AppShellComponent } from './layout/app-shell/app-shell';
import { isStandalonePage } from './layout/standalone-page';
import { PwaService } from './core/pwa';

/**
 * Switches the page to the light theme (dark text on white paper) and
 * returns a function that switches it back. Changes only the DOM, not the
 * saved preference.
 */
export function useLightThemeForPrint(doc: Document): () => void {
  const elements = [doc.documentElement, doc.body];
  const saved = elements.map((el) => ({
    el,
    theme: el.getAttribute('data-theme'),
    className: el.className,
  }));
  for (const el of elements) {
    el.setAttribute('data-theme', 'light');
    el.classList.remove('dark', 'theme-dark');
    el.classList.add('theme-light');
  }
  return () => {
    for (const { el, theme, className } of saved) {
      if (theme === null) el.removeAttribute('data-theme');
      else el.setAttribute('data-theme', theme);
      el.className = className;
    }
  };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent, ConfirmDialogComponent, AppShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  readonly isStandalone = signal<boolean>(true);

  constructor() {
    const doc = inject(DOCUMENT);
    const pwa = inject(PwaService);
    afterNextRender(() => {
      // Install prompt, offline status and updates.
      pwa.start();

      // Printing from the browser's menu: print in the light theme.
      let restore: (() => void) | null = null;
      doc.defaultView?.addEventListener('beforeprint', () => {
        restore ??= useLightThemeForPrint(doc);
        // Images below the screen load lazily; start them now so the printout
        // includes them (browsers that load lazy images for print already do).
        for (const img of Array.from(doc.images)) img.loading = 'eager';
      });
      doc.defaultView?.addEventListener('afterprint', () => {
        restore?.();
        restore = null;
      });
    });

    // Pages without the shell are marked in their routes (STANDALONE_PAGE).
    // Until the first navigation ends there is no route yet: keep the default.
    if (this.router.navigated) this.updateStandalone();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.updateStandalone());
  }

  private updateStandalone(): void {
    this.isStandalone.set(isStandalonePage(this.router.routerState.snapshot.root));
  }
}
