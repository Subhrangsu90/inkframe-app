export const SIGN_IN_PATH = '/signin';
export const SIGN_UP_PATH = '/signup';

/** Where to go after signing in when nothing else was asked for. */
export const DEFAULT_RETURN = '/docs';

/**
 * A safe place to go back to after signing in: a path inside the app, never
 * another site ("//evil.example" and "https://…" are refused) and never the
 * sign-in pages themselves.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_RETURN;
  }
  if (value.includes('\\') || /^\/(signin|signup)(\/|\?|#|$)/.test(value)) return DEFAULT_RETURN;
  return value;
}

/** Query params for a link to the sign-in or sign-up page that comes back to `returnTo`. */
export function returnToParams(returnTo: string | null | undefined): { returnTo?: string } {
  const safe = safeReturnTo(returnTo);
  return safe === DEFAULT_RETURN ? {} : { returnTo: safe };
}
