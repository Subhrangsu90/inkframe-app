/**
 * Every inkframe-server path the app calls, in one place. The server's
 * address comes from CLOUD.apiUrl (src/environments); the routes themselves
 * are listed, with their status, in inkframe-server/docs/Server_Plan.md.
 */
export const API = {
  /**
   * Better Auth, through its client: sign-up/email, sign-in/email,
   * sign-in/social, sign-out, get-session.
   */
  auth: '/api/auth',
  /** Which sign-in methods the server offers: `{ emailPassword, google }`. */
  authMethods: '/v1/auth/methods',
  /** What the server offers now: `{ signUp, minAppVersion, features }`. */
  config: '/v1/config',
  /** Checks an invite code and holds it (a cookie) for the sign-up that follows. */
  inviteCheck: '/v1/invites/check',
} as const;

/** A full URL for an API path, on the configured server. */
export function apiUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + path;
}
