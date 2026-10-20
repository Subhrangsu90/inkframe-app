import { InjectionToken } from '@angular/core';

/** The signed-in user, as the server's session reports it. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** What Better Auth's client returns: data, or an error with the HTTP status and Better Auth's code. */
export interface AuthApiResult<T> {
  data: T | null;
  error: { status: number; code?: string; message?: string } | null;
}

/**
 * The part of Better Auth's client the app uses. AuthService talks to this,
 * not to Better Auth directly, so tests can stand in for the server.
 */
export interface AuthApi {
  getSession(): Promise<AuthApiResult<{ user: SessionUser } | null>>;
  signInEmail(input: {
    email: string;
    password: string;
  }): Promise<AuthApiResult<{ user: SessionUser }>>;
  signUpEmail(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<AuthApiResult<{ user: SessionUser }>>;
  /** Sends the browser to Google; resolves only if that fails. */
  signInSocial(input: {
    provider: 'google';
    callbackURL: string;
    errorCallbackURL: string;
  }): Promise<AuthApiResult<unknown>>;
  signOut(): Promise<AuthApiResult<unknown>>;
}

/**
 * Loads the client on first use. Better Auth's client is loaded only when
 * someone uses accounts, so it never weighs on the first page load.
 */
export const AUTH_API_LOADER = new InjectionToken<(apiUrl: string) => Promise<AuthApi>>(
  'AuthApiLoader',
  {
    providedIn: 'root',
    factory: () => (apiUrl) => import('./better-auth-api').then((m) => m.createAuthApi(apiUrl)),
  },
);
