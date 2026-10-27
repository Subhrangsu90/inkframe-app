import { createAuthClient } from 'better-auth/client';
import type { z } from 'zod';
import { API, apiUrl } from '@app/core/api-endpoints';
import { REQUEST_TIMEOUT_MS, getJson, postJson } from '@app/core/api-response';
import type { AuthApi, AuthApiResult } from './auth-api';
import {
  AppConfigSchema,
  InviteAcceptedSchema,
  SessionSchema,
  SignInMethodsSchema,
  UserPayloadSchema,
  parseHint,
} from './auth.schemas';

/** Better Auth answered, but not with what the app expects. */
const UNEXPECTED = { status: 502, code: 'UNEXPECTED_RESPONSE', message: 'Unexpected answer' };

/**
 * Checks a Better Auth answer's data against a schema. A refusal passes
 * through as it is; data of the wrong shape becomes an error.
 */
async function checked<S extends z.ZodType>(
  call: Promise<unknown>,
  schema: S,
): Promise<AuthApiResult<z.output<S>>> {
  const { data, error } = (await call) as AuthApiResult<unknown>;
  if (error) return { data: null, error };
  const parsed = schema.safeParse(data);
  return parsed.success ? { data: parsed.data, error: null } : { data: null, error: UNEXPECTED };
}

/**
 * AuthApi on Better Auth's client and inkframe-server's /v1 routes. Loaded on
 * demand (see AUTH_API_LOADER); nothing else imports Better Auth.
 */
export function createAuthApi(base: string): AuthApi {
  const client = createAuthClient({
    // An empty base is the app's own origin (CloudConfig.apiUrl); Better Auth needs it spelled out.
    baseURL: base || globalThis.location.origin,
    basePath: API.auth,
    // The session is a cookie for the server's origin: send it along.
    fetchOptions: { credentials: 'include', timeout: REQUEST_TIMEOUT_MS },
  });
  return {
    getSession: () => checked(client.getSession(), SessionSchema),
    signInEmail: (input) => checked(client.signIn.email(input), UserPayloadSchema),
    signUpEmail: (input) => checked(client.signUp.email(input), UserPayloadSchema),
    signInSocial: (input) => client.signIn.social(input) as Promise<AuthApiResult<unknown>>,
    signOut: () => client.signOut() as Promise<AuthApiResult<unknown>>,
    getMethods: () => getJson(apiUrl(base, API.authMethods), SignInMethodsSchema),
    getConfig: () => getJson(apiUrl(base, API.config), AppConfigSchema),
    // `include`: the server answers with the cookie that carries the code to the sign-up.
    checkInvite: async (code) => {
      await postJson(apiUrl(base, API.inviteCheck), { code }, InviteAcceptedSchema, {
        credentials: 'include',
      });
    },
    parseHint,
  };
}
