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
    /**
     * Empty: the app's own origin. Its host forwards the server's paths
     * (/api/auth, /v1) to inkframe-server (vercel.json), so the session
     * cookie belongs to the app's site. Endpoint paths: src/app/core/api-endpoints.ts.
     */
    apiUrl: '',
  },
};
