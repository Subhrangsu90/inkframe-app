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
import { RouterLink, RouterLinkActive } from '@angular/router';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { ThemeService, VisualViewportTracker } from '@inkframe-ui/editor/core';
import { LayoutService } from '../layout.service';
import { formatRelativeTime } from '@app/features/documents/data-access/document-manager';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { docPath } from '@app/features/documents/documents.paths';
import { StorageBanner } from '../storage-banner/storage-banner';
import { PwaService } from '@app/core/pwa';

@Component({
  selector: 'ink-app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, InkIcon, StorageBanner],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly layout = inject(LayoutService);
  readonly library = inject(DocumentLibrary);
  readonly themeService = inject(ThemeService);
  readonly pwa = inject(PwaService);
  readonly docPath = docPath;

  private readonly mainContent = viewChild.required<ElementRef<HTMLElement>>('mainContent');

  constructor() {
    // The layout fits the area above an on-screen keyboard (see the styles).
    const viewport = inject(VisualViewportTracker);
    afterNextRender(() => viewport.start());
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

  async installApp(): Promise<void> {
    this.layout.closeMobile();
    await this.pwa.install();
  }
}
