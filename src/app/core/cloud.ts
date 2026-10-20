import { InjectionToken, isDevMode } from '@angular/core';

/** Inkframe's optional cloud features (accounts now, sync next): on or off, and where the server is. */
export interface CloudConfig {
  /** Whether accounts appear in the app: sign-in pages, the sidebar's account item, Settings → Account. */
  enabled: boolean;
  /** The inkframe-server origin, without a trailing slash. */
  apiUrl: string;
}

/**
 * On in development (with inkframe-server on localhost:3001). Off in
 * production builds until sync ships, so the released app makes no account
 * or sync claims it can't keep (product plan, section 5, "Fallback").
 */
export const CLOUD = new InjectionToken<CloudConfig>('CloudConfig', {
  providedIn: 'root',
  factory: () =>
    isDevMode()
      ? { enabled: true, apiUrl: 'http://localhost:3001' }
      : { enabled: false, apiUrl: 'https://api.inkframe.app' },
});
