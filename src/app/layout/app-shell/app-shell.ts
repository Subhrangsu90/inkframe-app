import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { InkAvatar } from '@app/shared/ui/avatar/avatar';
import { ThemeService, VisualViewportTracker } from '@inkframe-ui/editor/core';
import { LayoutService } from '../layout.service';
import { formatRelativeTime } from '@app/features/documents/data-access/document-manager';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { docPath } from '@app/features/documents/documents.paths';
import { AuthService } from '@app/features/account/data-access/auth.service';
import { SIGN_IN_PATH, returnToParams } from '@app/features/account/account.paths';
import { StorageBanner } from '../storage-banner/storage-banner';

@Component({
  selector: 'ink-app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, InkIcon, InkAvatar, StorageBanner],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly layout = inject(LayoutService);
  readonly library = inject(DocumentLibrary);
  readonly themeService = inject(ThemeService);
  readonly auth = inject(AuthService);
  readonly docPath = docPath;
  readonly signInPath = SIGN_IN_PATH;

  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** "Sign in" comes back to the page it was clicked on. */
  readonly signInParams = computed(() => returnToParams(this.currentUrl()));

  constructor() {
    // The layout fits the area above an on-screen keyboard (see the styles).
    const viewport = inject(VisualViewportTracker);
    afterNextRender(() => {
      viewport.start();
      // After the first render, so the server-rendered sidebar and the browser's agree.
      this.auth.start();
    });
  }

  /** The skip link: moves keyboard focus past the sidebar to the page. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.mainContent().nativeElement.focus();
  }

  readonly isDark = computed(() => this.themeService.theme() === 'dark');
  readonly pageTitle = input<string>('');

  formatTime(timestamp: number): string {
    return formatRelativeTime(timestamp);
  }

  toggleTheme(event: Event): void {
    this.themeService.toggleTheme(event);
  }

  onCreateNewDoc(): void {
    this.layout.closeMobile();
    this.library.createNewDoc();
  }
}
