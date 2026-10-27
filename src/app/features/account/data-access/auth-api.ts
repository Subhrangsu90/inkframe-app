import { InjectionToken } from '@angular/core';
import type { AccountHint, AccountUser, AppConfig, SignInMethods } from './auth.schemas';

/** What Better Auth's client returns: data, or an error with the HTTP status and Better Auth's code. */
export interface AuthApiResult<T> {
  data: T | null;
  error: { status: number; code?: string; message?: string } | null;
}

/**
 * Everything AuthService needs from the server, with every answer already
 * checked against the Zod schemas in auth.schemas.ts. AuthService talks to
 * this, not to Better Auth or Zod directly, so both load only on demand and
 * tests can stand in for the server.
 */
export interface AuthApi {
  /** Who is signed in; `data` is null when nobody is. */
  getSession(): Promise<AuthApiResult<{ user: AccountUser } | null>>;
  signInEmail(input: {
    email: string;
    password: string;
  }): Promise<AuthApiResult<{ user: AccountUser }>>;
  signUpEmail(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<AuthApiResult<{ user: AccountUser }>>;
  /** Sends the browser to Google; resolves only if that fails. */
  signInSocial(input: {
    provider: 'google';
    callbackURL: string;
    errorCallbackURL: string;
  }): Promise<AuthApiResult<unknown>>;
  signOut(): Promise<AuthApiResult<unknown>>;
  /** GET /v1/auth/methods. Throws when the server can't be reached or answers oddly. */
  getMethods(): Promise<SignInMethods>;
  /** GET /v1/config. Throws when the server can't be reached or answers oddly. */
  getConfig(): Promise<AppConfig>;
  /**
   * POST /v1/invites/check: resolves when the code works (the server then
   * holds it for the sign-up that follows). Throws ApiRequestError
   * (`invalid_invite`) when it doesn't, TypeError when offline.
   */
  checkInvite(code: string): Promise<void>;
  /** Reads what this device remembers (see AccountHintSchema); null when missing or invalid. */
  parseHint(raw: string): AccountHint | null;
}

/**
 * Loads the client on first use. Better Auth's client and Zod are loaded only
 * when someone uses accounts, so they never weigh on the first page load.
 */
export const AUTH_API_LOADER = new InjectionToken<(apiUrl: string) => Promise<AuthApi>>(
  'AuthApiLoader',
  {
    providedIn: 'root',
    factory: () => (apiUrl) => import('./better-auth-api').then((m) => m.createAuthApi(apiUrl)),
  },
);
