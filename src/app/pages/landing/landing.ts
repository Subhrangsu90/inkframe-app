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
import { InkIcon, Card, Button } from '../../shared/ui';

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

  heroTab = signal<'rich' | 'markdown' | 'split'>('rich');
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
    { keys: ['Ctrl', 'Shift', 'X'], macKeys: ['⌘', 'Shift', 'X'], action: 'Strikethrough' },
    { keys: ['/'], macKeys: ['/'], action: 'Slash command menu' },
    { keys: ['Ctrl', 'Z'], macKeys: ['⌘', 'Z'], action: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], macKeys: ['⌘', 'Shift', 'Z'], action: 'Redo' },
    { keys: ['Ctrl', 'S'], macKeys: ['⌘', 'S'], action: 'Save document' },
  ];

  readonly pricingPlans = [
    {
      name: 'Community',
    price: 'Free',
      period: 'forever',
        description: 'For writers who value simplicity and privacy.',
          featured: false,
            features: [
              'Unlimited local documents',
              'Full ProseMirror editor',
              'Markdown & HTML export',
              'Syntax highlighting',
              'Zero telemetry guarantee',
              'Open source codebase',
            ],
              cta: 'Start Writing',
    },
{
  name: 'Writer Pro',
    price: '$9',
      period: '/month',
        description: 'For serious writers who need advanced tools.',
          featured: true,
            features: [
              'Everything in Community',
              'Custom typography presets',
              'Advanced document search',
              'Local encrypted backups',
              'Table & diagram support',
              'Priority feature requests',
            ],
              cta: 'Upgrade to Pro',
    },
{
  name: 'Sponsor',
    price: '$29',
      period: '/month',
        description: 'Support independent open-source development.',
          featured: false,
            features: [
              'Everything in Writer Pro',
              'Early access to features',
              'Name in contributors list',
              'Direct developer access',
              'Custom plugin support',
              'Shape the roadmap',
            ],
              cta: 'Become a Sponsor',
    },
  ];

  readonly testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Technical Writer',
    quote:
      'Inkframe replaced three tools for me. The offline-first approach means I can write on flights, in cafes, anywhere—without worrying about connectivity.',
    avatar: 'SC',
  },
  {
    name: 'Marcus Rivera',
    role: 'Developer Advocate',
    quote:
      'The slash commands and PrismJS integration make documenting code a joy. It feels like VSCode met Notion, but without the cloud dependency.',
    avatar: 'MR',
  },
  {
    name: 'Aiko Tanaka',
    role: 'Privacy Researcher',
    quote:
      'Finally, a writing tool that respects privacy by design. Zero telemetry, fully local—this is how software should be built.',
    avatar: 'AT',
  },
];

constructor() {
  afterNextRender(() => {
    // Detect macOS for keyboard shortcuts (⌘ vs Ctrl)
    if (typeof navigator !== 'undefined') {
      const isMacPlatform = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      this.isMac.set(isMacPlatform);
    }

    // Initialize theme from system preference
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;
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
            `perspective(1200px) rotateX(${rotateX}deg) scale(${scale}) translateY(${translateY}px)`
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
  if(isPlatformBrowser(this.platformId)) {
  if (this.scrollListener) {
    window.removeEventListener('scroll', this.scrollListener);
  }
  if (this.shortcutTimeout) {
    clearTimeout(this.shortcutTimeout);
  }
}
  }

/* ── Hero Mockup Tabs & Copy Code ── */
setHeroTab(tab: 'rich' | 'markdown' | 'split'): void {
  this.heroTab.set(tab);
}

copyCode(): void {
  if(!isPlatformBrowser(this.platformId)) return;
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
  if(!target) return;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  target.style.setProperty('--mouse-x', `${x}px`);
  target.style.setProperty('--mouse-y', `${y}px`);
}

/* ── Interactive Keyboard Shortcut Simulator ── */
triggerShortcut(action: string, keyName ?: string): void {
  this.activeShortcut.set(action);
  this.lastPressedKeyDisplay.set(keyName || action);
  if(this.shortcutTimeout) clearTimeout(this.shortcutTimeout);
  this.shortcutTimeout = setTimeout(() => {
    this.activeShortcut.set(null);
  }, 1200);
}

@HostListener('window:keydown', ['$event'])
handleKeyboardShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
  if(this.mobileMenuOpen()) {
  this.closeMobileMenu();
}
  }

toggleTheme(): void {
  const newDark = !this.isDark();
  this.isDark.set(newDark);
  this.applyTheme(newDark);
  localStorage.setItem('inkframe-theme', newDark ? 'dark' : 'light');
}

toggleMobileMenu(): void {
  this.mobileMenuOpen.set(!this.mobileMenuOpen());
}

closeMobileMenu(): void {
  this.mobileMenuOpen.set(false);
}

  private applyTheme(dark: boolean): void {
  if(isPlatformBrowser(this.platformId)) {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', dark);
  document.body.setAttribute('data-theme', theme);
  document.body.classList.toggle('dark', dark);
}
  }
}
