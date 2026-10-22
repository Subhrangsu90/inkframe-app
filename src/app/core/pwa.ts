import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { ToastService } from '@app/shared/ui/toast/toast';

/** Fired by Chromium browsers when the app can be installed; not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** While the app stays open, look for a new version at most this often. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Whether the page runs as an installed app, in its own window. */
export function isStandalone(win: Window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iPhone and iPad: every browser installs web apps from its Share menu
 * ("Add to Home Screen"); none offers an install prompt.
 */
export function isIos(nav: Navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    // iPadOS reports itself as a Mac, but Macs have no touch screen.
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  );
}

/**
 * The installable app: the browser's install prompt, whether the app works
 * offline, and updates. Started once by the root component.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly doc = inject(DOCUMENT);
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly toast = inject(ToastService);

  private started = false;
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private lastUpdateCheck = 0;
  private readonly beforeReloadTasks = new Set<() => Promise<void>>();

  /** The browser offers to install the app: install() shows its prompt. */
  readonly canInstall = signal(false);
  /** Running as the installed app. */
  readonly standalone = signal(false);
  /** iPhone or iPad, where the app is installed from the Share menu. */
  readonly installFromShareMenu = signal(false);
  /** The app is cached in this browser, so it starts without a network connection. */
  readonly offlineReady = signal(false);
  /** A new version has been downloaded; it starts when the page reloads. */
  readonly updateReady = signal(false);

  /** Starts listening. Does nothing on the server or when already started. */
  start(): void {
    const win = this.doc.defaultView;
    if (this.started || !win) return;
    this.started = true;

    this.standalone.set(isStandalone(win));
    win.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => {
      this.standalone.set(isStandalone(win));
    });
    this.installFromShareMenu.set(isIos(win.navigator));

    win.addEventListener('beforeinstallprompt', (event) => {
      // Offer installing in the sidebar and Settings instead of the browser's banner.
      event.preventDefault();
      this.installPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    win.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.canInstall.set(false);
      this.toast.success('Inkframe is installed. Open it from your home screen or app list.', 5000);
    });

    this.followThemeColor();
    this.followServiceWorker(win);
  }

  /** Shows the browser's install prompt. Resolves to whether the app was installed. */
  async install(): Promise<boolean> {
    const prompt = this.installPrompt;
    if (!prompt) return false;
    // A prompt can be shown once; the browser fires a new event if it may ask again.
    this.installPrompt = null;
    this.canInstall.set(false);
    await prompt.prompt();
    return (await prompt.userChoice).outcome === 'accepted';
  }

  /**
   * Registers work that must finish before the page reloads for an update,
   * such as saving edits. Returns a function that removes it.
   */
  beforeReload(task: () => Promise<void>): () => void {
    this.beforeReloadTasks.add(task);
    return () => this.beforeReloadTasks.delete(task);
  }

  /** Saves pending work, then reloads; after an update, the new version starts. */
  async reload(): Promise<void> {
    for (const task of [...this.beforeReloadTasks]) {
      try {
        await task();
      } catch (e) {
        console.warn('Could not finish before reloading:', e);
      }
    }
    this.reloadPage();
  }

  private reloadPage(): void {
    this.doc.location.reload();
  }

  private followServiceWorker(win: Window): void {
    const updates = this.swUpdate;
    const sw = win.navigator.serviceWorker;
    if (!updates?.isEnabled || !sw) return;

    // The worker takes control once it is installed; it caches the app right after.
    this.offlineReady.set(!!sw.controller);
    sw.addEventListener('controllerchange', () => this.offlineReady.set(!!sw.controller));

    updates.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        if (this.updateReady()) return;
        this.updateReady.set(true);
        this.toast.info('A new version of Inkframe is ready.', 0, {
          label: 'Reload',
          onClick: () => void this.reload(),
        });
      });

    updates.unrecoverable.subscribe(() => {
      this.toast.error('Part of Inkframe is missing from this browser. Reload to fix it.', 0, {
        label: 'Reload',
        onClick: () => void this.reload(),
      });
    });

    // The worker looks for updates when the app starts. An installed app can
    // stay open for days, so also look when it comes back to the foreground.
    this.lastUpdateCheck = Date.now();
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState !== 'visible') return;
      if (Date.now() - this.lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
      this.lastUpdateCheck = Date.now();
      updates.checkForUpdate().catch(() => {
        // Offline, or the server is unreachable: try again next time.
      });
    });
  }

  /**
   * Keeps `<meta name="theme-color">` on the app's surface color, which an
   * installed app uses for its title bar, in whichever theme the page shows.
   */
  private followThemeColor(): void {
    const root = this.doc.documentElement;
    const win = this.doc.defaultView;
    if (!win || typeof MutationObserver === 'undefined') return;
    const apply = () => {
      const color = win.getComputedStyle(root).getPropertyValue('--ink-surface').trim();
      if (!color) return;
      for (const meta of this.doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = color;
      }
    };
    new MutationObserver(apply).observe(root, { attributeFilter: ['data-theme'] });
    apply();
  }
}
