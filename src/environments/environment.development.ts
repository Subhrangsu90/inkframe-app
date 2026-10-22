/**
 * Settings for `ng serve` and development builds; replaces environment.ts
 * there (angular.json, `fileReplacements`). Keep the same shape.
 */
export const environment = {
  production: false,
  /** inkframe-server running locally: `npm run dev` in ../inkframe-server. */
  cloud: {
    enabled: true,
    apiUrl: 'http://localhost:3001',
  },
};
