import { InjectionToken } from '@angular/core';
import { environment } from '@env/environment';

/** Inkframe's optional cloud features (accounts now, sync next): on or off, and where the server is. */
export interface CloudConfig {
  /** Whether accounts appear in the app: sign-in pages, the sidebar's account item, Settings → Account. */
  enabled: boolean;
  /**
   * The inkframe-server origin, without a trailing slash; empty for the app's
   * own origin, when its host forwards the server's paths. Paths: core/api-endpoints.ts.
   */
  apiUrl: string;
}

/**
 * Comes from the build's environment file (src/environments): on with
 * localhost:3001 in development, on in staging builds (through Vercel's
 * proxy), off in production builds until sync ships. Tests provide their own.
 */
export const CLOUD = new InjectionToken<CloudConfig>('CloudConfig', {
  providedIn: 'root',
  factory: () => environment.cloud,
});
