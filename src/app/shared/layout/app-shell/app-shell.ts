import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { InkIcon } from '../../ui/icons/icon';
import { ThemeService, VisualViewportTracker } from '@inkframe-ui/editor/core';
import { LayoutService } from '../layout.service';
import { formatRelativeTime } from '../../../core/document-manager';
import { StorageBanner } from '../storage-banner/storage-banner';
import { PwaService } from '../../../core/pwa';

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
  readonly themeService = inject(ThemeService);
  readonly pwa = inject(PwaService);

  constructor() {
    // The layout fits the area above an on-screen keyboard (see the styles).
    const viewport = inject(VisualViewportTracker);
    afterNextRender(() => viewport.start());
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
    this.layout.createNewDoc();
  }

  async installApp(): Promise<void> {
    this.layout.closeMobile();
    await this.pwa.install();
  }
}
