import { createAuthClient } from 'better-auth/client';
import type { AuthApi, AuthApiResult } from './auth-api';

/**
 * AuthApi on Better Auth's client, against inkframe-server. Loaded on demand
 * (see AUTH_API_LOADER); nothing else imports Better Auth.
 */
export function createAuthApi(apiUrl: string): AuthApi {
  const client = createAuthClient({
    baseURL: apiUrl,
    // The session is a cookie for the server's origin: send it along.
    fetchOptions: { credentials: 'include' },
  });
  const result = <T>(promise: Promise<unknown>) => promise as Promise<AuthApiResult<T>>;
  return {
    getSession: () => result(client.getSession()),
    signInEmail: (input) => result(client.signIn.email(input)),
    signUpEmail: (input) => result(client.signUp.email(input)),
    signInSocial: (input) => result(client.signIn.social(input)),
    signOut: () => result(client.signOut()),
  };
}
