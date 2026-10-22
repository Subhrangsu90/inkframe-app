import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
  PLATFORM_ID,
  afterNextRender,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { revealThemeChange } from '@inkframe-ui/editor/core';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { Card } from '@app/shared/ui/card/card';
import { Button } from '@app/shared/ui/button/button';

@Component({
  selector: 'ink-landing',
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, InkIcon, Card, Button],
})
export class Landing implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  isDark = signal(false);
  mobileMenuOpen = signal(false);
  headerScrolled = signal(false);
  mockupTransform = signal('perspective(1200px) rotateX(16deg) scale(0.94)');

  heroTab = signal<'rich' | 'markdown'>('rich');
  codeCopied = signal(false);
  activeShortcut = signal<string | null>(null);
  lastPressedKeyDisplay = signal<string | null>(null);
  isMac = signal(false);

  private scrollListener: (() => void) | null = null;
  private shortcutTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly shortcuts = [
    { keys: ['Ctrl', 'B'], macKeys: ['⌘', 'B'], action: 'Bold text' },
    { keys: ['Ctrl', 'I'], macKeys: ['⌘', 'I'], action: 'Italic text' },
    { keys: ['Ctrl', 'K'], macKeys: ['⌘', 'K'], action: 'Insert link' },
    { keys: ['Ctrl', 'Shift', 'S'], macKeys: ['⌘', 'Shift', 'S'], action: 'Strikethrough' },
    { keys: ['/'], macKeys: ['/'], action: 'Slash command menu' },
    { keys: ['Ctrl', 'Z'], macKeys: ['⌘', 'Z'], action: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], macKeys: ['⌘', 'Shift', 'Z'], action: 'Redo' },
    { keys: ['Ctrl', 'Shift', '8'], macKeys: ['⌘', 'Shift', '8'], action: 'Bulleted list' },
  ];

  constructor() {
    afterNextRender(() => {
      // Detect macOS for keyboard shortcuts (⌘ vs Ctrl)
      if (typeof navigator !== 'undefined') {
        const isMacPlatform = /Mac|iPod|iPhone|iPad/.test(
          navigator.platform || navigator.userAgent,
        );
        this.isMac.set(isMacPlatform);
      }

      // Initialize theme from system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const savedTheme = localStorage.getItem('inkframe-theme');
      const useDark = savedTheme ? savedTheme === 'dark' : prefersDark;
      this.isDark.set(useDark);
      this.applyTheme(useDark);

      // Scroll listener for header and 3D hero mockup tilt
      let ticking = false;
      this.scrollListener = () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            this.headerScrolled.set(scrollY > 40);
            if (scrollY > 40 && this.mobileMenuOpen()) {
              this.mobileMenuOpen.set(false);
            }

            // 3D tilt calculation: from 16deg to 0deg, scale 0.94 to 1.0
            const progress = Math.min(Math.max(scrollY / 420, 0), 1);
            const rotateX = +(16 * (1 - progress)).toFixed(2);
            const scale = +(0.94 + 0.06 * progress).toFixed(3);
            const translateY = +(-12 * progress).toFixed(1);
            this.mockupTransform.set(
              `perspective(1200px) rotateX(${rotateX}deg) scale(${scale}) translateY(${translateY}px)`,
            );

            ticking = false;
          });
          ticking = true;
        }
      };
      window.addEventListener('scroll', this.scrollListener, {
        passive: true,
      });
    });
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.scrollListener) {
        window.removeEventListener('scroll', this.scrollListener);
      }
      if (this.shortcutTimeout) {
        clearTimeout(this.shortcutTimeout);
      }
    }
  }

  /* ── Hero Mockup Tabs & Copy Code ── */
  setHeroTab(tab: 'rich' | 'markdown'): void {
    this.heroTab.set(tab);
  }

  copyCode(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const snippet = `const editor = new InkframeEditor({
  offline: true,
  theme: 'minimal',
  plugins: ['syntax-highlight', 'slash-commands']
});`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snippet).then(() => {
        this.codeCopied.set(true);
        setTimeout(() => this.codeCopied.set(false), 2000);
      });
    }
  }

  /* ── Bento Spotlight Glow ── */
  onSpotlightMouseMove(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty('--mouse-x', `${x}px`);
    target.style.setProperty('--mouse-y', `${y}px`);
  }

  /* ── Interactive Keyboard Shortcut Simulator ── */
  triggerShortcut(action: string, keyName?: string): void {
    this.activeShortcut.set(action);
    this.lastPressedKeyDisplay.set(keyName || action);
    if (this.shortcutTimeout) clearTimeout(this.shortcutTimeout);
    this.shortcutTimeout = setTimeout(() => {
      this.activeShortcut.set(null);
    }, 1200);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }

    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    const key = event.key ? event.key.toUpperCase() : '';
    const modifier = this.isMac() ? '⌘' : 'Ctrl';

    if (isCtrlOrMeta && key === 'B') {
      event.preventDefault();
      this.triggerShortcut('Bold text', `${modifier} + B`);
    } else if (isCtrlOrMeta && key === 'I') {
      event.preventDefault();
      this.triggerShortcut('Italic text', `${modifier} + I`);
    } else if (isCtrlOrMeta && key === 'K') {
      event.preventDefault();
      this.triggerShortcut('Insert link', `${modifier} + K`);
    } else if (isCtrlOrMeta && event.shiftKey && key === 'X') {
      event.preventDefault();
      this.triggerShortcut('Strikethrough', `${modifier} + Shift + X`);
    } else if (event.key === '/') {
      // Highlight slash command
      this.triggerShortcut('Slash command menu', '/');
    } else if (isCtrlOrMeta && !event.shiftKey && key === 'Z') {
      event.preventDefault();
      this.triggerShortcut('Undo', `${modifier} + Z`);
    } else if (isCtrlOrMeta && event.shiftKey && key === 'Z') {
      event.preventDefault();
      this.triggerShortcut('Redo', `${modifier} + Shift + Z`);
    } else if (isCtrlOrMeta && key === 'S') {
      event.preventDefault();
      this.triggerShortcut('Save document', `${modifier} + S`);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.closeMobileMenu();
    }
  }

  toggleTheme(event: Event): void {
    const newDark = !this.isDark();
    revealThemeChange(document, event, () => {
      this.isDark.set(newDark);
      this.applyTheme(newDark);
    });
    localStorage.setItem('inkframe-theme', newDark ? 'dark' : 'light');
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.set(!this.mobileMenuOpen());
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  private applyTheme(dark: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      const theme = dark ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.toggle('dark', dark);
      document.body.setAttribute('data-theme', theme);
      document.body.classList.toggle('dark', dark);
    }
  }
}
