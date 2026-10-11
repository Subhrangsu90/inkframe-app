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
  readonly isLanding = signal<boolean>(true);

  constructor() {
    // Check initial route
    const currentUrl = this.normalizeUrl(this.router.url);
    this.isLanding.set(currentUrl === '' || currentUrl === '/');

    // Subscribe to navigation events
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const url = this.normalizeUrl(event.urlAfterRedirects);
        this.isLanding.set(url === '' || url === '/');
      });
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }
}
