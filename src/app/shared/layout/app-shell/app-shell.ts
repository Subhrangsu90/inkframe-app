import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { InkIcon } from '../../ui/icons/icon';
import { ThemeService } from '@inkframe-ui/editor/core';
import { LayoutService } from '../layout.service';
import { formatRelativeTime } from '../../../core/document-manager';

@Component({
  selector: 'ink-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    InkIcon,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly layout = inject(LayoutService);
  readonly themeService = inject(ThemeService);

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
}
