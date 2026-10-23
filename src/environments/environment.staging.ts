/**
 * Settings for staging builds (`npm run build:app:staging`, which Vercel runs:
 * vercel.json): production's, with accounts on. Replaces environment.ts there
 * (angular.json, the `staging` configuration). Keep the same shape.
 */
export const environment = {
  production: true,
  cloud: {
    enabled: true,
    /** The app's own origin; vercel.json forwards /api/auth and /v1 to inkframe-server on Render. */
    apiUrl: '',
  },
};
