/**
 * Settings that differ between builds. This file is for production builds;
 * `ng serve` and development builds use environment.development.ts instead
 * (angular.json, `fileReplacements`). Both files keep the same shape.
 */
export const environment = {
  production: true,
  /** inkframe-server: accounts now, sync next. */
  cloud: {
    /**
     * Off until sync ships, so the released app makes no account or sync
     * claims it can't keep (product plan, section 5, "Fallback").
     */
    enabled: false,
    /** The server's origin, without a trailing slash. Endpoint paths: src/app/core/api-endpoints.ts. */
    apiUrl: 'https://api.inkframe.app',
  },
};
