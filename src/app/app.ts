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
      });
      doc.defaultView?.addEventListener('afterprint', () => {
        restore?.();
        restore = null;
      });
    });

    this.updateStandalone(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateStandalone(event.urlAfterRedirects);
      });
  }

  private updateStandalone(rawUrl: string): void {
    const url = this.normalizeUrl(rawUrl);
    // Standalone routes: Landing page ('/' or '') and Reader page ('/s', '/s#...', '/s/...').
    // Not a bare startsWith('/s'): that also matches '/settings'.
    const standalone = url === '' || url === '/' || url === '/s' || url.startsWith('/s/');
    this.isStandalone.set(standalone);
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
