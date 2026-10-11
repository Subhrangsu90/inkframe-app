import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToastContainerComponent, ConfirmDialogComponent } from './shared/ui';
import { AppShellComponent } from './shared/layout/app-shell/app-shell';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    ToastContainerComponent,
    ConfirmDialogComponent,
    AppShellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  readonly isStandalone = signal<boolean>(true);

  constructor() {
    this.updateStandalone(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.updateStandalone(event.urlAfterRedirects);
      });
  }

  private updateStandalone(rawUrl: string): void {
    const url = this.normalizeUrl(rawUrl);
    // Standalone routes: Landing page ('/' or '') and Reader page ('/s/...')
    const standalone = url === '' || url === '/' || url.startsWith('/s/') || url.startsWith('/s');
    this.isStandalone.set(standalone);
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
