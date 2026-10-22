import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NavigationError } from '@angular/router';
import { ToastService } from '@app/shared/ui';
import { handleNavigationError } from './navigation-errors';

const failed = (message: string) => new NavigationError(1, '/doc/abc', new TypeError(message));
const handle = (error: NavigationError) =>
  TestBed.runInInjectionContext(() => handleNavigationError(error));

describe('handleNavigationError', () => {
  afterEach(() => vi.restoreAllMocks());

  it("says when a page's code could not be downloaded, and offers to reload", () => {
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    handle(failed('Failed to fetch dynamically imported module: https://x/chunk-ABC.js'));

    expect(toast).toHaveBeenCalledTimes(1);
    const [message, duration, action] = toast.mock.calls[0];
    expect(message).toBe('This page could not be loaded. Reload to try again.');
    expect(duration).toBe(0);
    expect(action?.label).toBe('Reload');
  });

  it('says so differently offline, in every browser', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    handle(failed('Importing a module script failed.')); // Safari
    handle(failed('error loading dynamically imported module: https://x/chunk.js')); // Firefox

    expect(toast).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls[0][0]).toMatch(/^You're offline/);
  });

  it('leaves other navigation errors to the router', () => {
    const toast = vi.spyOn(TestBed.inject(ToastService), 'error');
    handle(failed('Cannot match any routes'));
    expect(toast).not.toHaveBeenCalled();
  });
});
