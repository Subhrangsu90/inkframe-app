import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { ToastService } from '../shared/ui';
import { PwaService, isIos } from './pwa';

/** A browser's install prompt event, as Chromium fires it. */
function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  });
}

function setup() {
  const versionUpdates = new Subject<{ type: string }>();
  const unrecoverable = new Subject<{ type: string; reason: string }>();
  const swUpdate = {
    isEnabled: true,
    versionUpdates,
    unrecoverable,
    checkForUpdate: vi.fn(async () => false),
  };
  const worker = Object.assign(new EventTarget(), { controller: null as object | null });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker });
  TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: swUpdate }] });
  const pwa = TestBed.inject(PwaService);
  const toast = TestBed.inject(ToastService);
  const reloadPage = vi.spyOn(pwa as any, 'reloadPage').mockImplementation(() => undefined);
  pwa.start();
  return { pwa, toast, swUpdate, worker, versionUpdates, unrecoverable, reloadPage };
}

describe('PwaService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as any).serviceWorker;
  });

  it('keeps the install prompt for the Install button and shows it once', async () => {
    const { pwa } = setup();
    expect(pwa.canInstall()).toBe(false);

    const event = installPromptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // no browser banner
    expect(pwa.canInstall()).toBe(true);

    expect(await pwa.install()).toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(pwa.canInstall()).toBe(false);
    expect(await pwa.install()).toBe(false);
  });

  it('reports a dismissed prompt, and confirms an installation', async () => {
    const { pwa, toast } = setup();
    window.dispatchEvent(installPromptEvent('dismissed'));
    expect(await pwa.install()).toBe(false);

    const success = vi.spyOn(toast, 'success');
    window.dispatchEvent(installPromptEvent('accepted'));
    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.canInstall()).toBe(false);
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Inkframe is installed'), 5000);
  });

  it('is ready offline once the service worker controls the page', () => {
    const { pwa, worker } = setup();
    expect(pwa.offlineReady()).toBe(false);
    worker.controller = {};
    worker.dispatchEvent(new Event('controllerchange'));
    expect(pwa.offlineReady()).toBe(true);
  });

  it('offers one Reload for a new version, and saves edits before reloading', async () => {
    const { pwa, toast, versionUpdates, reloadPage } = setup();
    const info = vi.spyOn(toast, 'info');
    const order: string[] = [];
    const remove = pwa.beforeReload(async () => {
      await Promise.resolve();
      order.push('saved');
    });
    reloadPage.mockImplementation(() => order.push('reloaded'));

    versionUpdates.next({ type: 'VERSION_DETECTED' });
    expect(info).not.toHaveBeenCalled();
    versionUpdates.next({ type: 'VERSION_READY' });
    versionUpdates.next({ type: 'VERSION_READY' });
    expect(info).toHaveBeenCalledOnce();
    expect(pwa.updateReady()).toBe(true);

    const [message, duration, action] = info.mock.calls[0];
    expect(message).toBe('A new version of Inkframe is ready.');
    expect(duration).toBe(0); // stays until used or dismissed
    expect(action?.label).toBe('Reload');
    action!.onClick();
    await vi.waitFor(() => expect(order).toEqual(['saved', 'reloaded']));

    // A page that has gone (the editor was closed) no longer delays reloads.
    remove();
    order.length = 0;
    await pwa.reload();
    expect(order).toEqual(['reloaded']);
  });

  it('reloads even when saving before the reload fails', async () => {
    const { pwa, reloadPage } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pwa.beforeReload(async () => {
      throw new Error('quota');
    });
    await pwa.reload();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('asks for a reload when the cached app is broken', () => {
    const { toast, unrecoverable } = setup();
    const error = vi.spyOn(toast, 'error');
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing files' });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Reload'), 0, expect.anything());
  });

  it('looks for updates when an app left open comes back, at most once an hour', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1, 12));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { swUpdate } = setup();
    const visible = () => document.dispatchEvent(new Event('visibilitychange'));

    now.mockReturnValue(Date.UTC(2026, 0, 1, 12, 30));
    visible();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled(); // looked at start

    now.mockReturnValue(Date.UTC(2026, 0, 1, 13, 1));
    visible();
    visible();
    expect(swUpdate.checkForUpdate).toHaveBeenCalledOnce();
  });
});

describe('isIos', () => {
  const nav = (userAgent: string, platform: string, maxTouchPoints: number) =>
    ({ userAgent, platform, maxTouchPoints }) as Navigator;

  it('recognizes iPhones and iPads, including iPads that report a Mac', () => {
    expect(isIos(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5))).toBe(
      true,
    );
    expect(isIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5))).toBe(true);
  });

  it('leaves out Macs and Android', () => {
    expect(isIos(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0))).toBe(
      false,
    );
    expect(isIos(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5))).toBe(false);
  });
});
