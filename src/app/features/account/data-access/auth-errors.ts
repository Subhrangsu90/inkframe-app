import type { AuthApiResult } from './auth-api';

type ApiError = NonNullable<AuthApiResult<unknown>['error']>;

export const NETWORK_ERROR =
  "Can't reach the Inkframe server. Check your connection and try again.";

const UNKNOWN_ERROR = 'Something went wrong. Try again.';

const INVITE_REQUIRED_MESSAGE =
  'Creating an account needs an invite code for now. Choose "Create an account" and enter yours.';
const SIGN_UP_CLOSED_MESSAGE =
  "New accounts aren't open right now. You can keep writing without one.";

/** POST /v1/invites/check refused the code. */
export const INVALID_INVITE =
  "This invite code doesn't work. Check it, or ask for a new one: it may be used up or expired.";

/** Better Auth's error codes, in words people can act on. */
const BY_CODE: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  INVALID_PASSWORD: "That email and password don't match an account.",
  USER_NOT_FOUND: "That email and password don't match an account.",
  USER_ALREADY_EXISTS: 'There is already an account with this email. Sign in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'There is already an account with this email. Sign in instead.',
  PASSWORD_TOO_SHORT: 'Use a password with at least 8 characters.',
  PASSWORD_TOO_LONG: 'Use a password with at most 128 characters.',
  INVALID_EMAIL: 'Enter a valid email address.',
  PROVIDER_NOT_FOUND: "Google sign-in isn't available right now.",
  // inkframe-server's sign-up rules (SIGN_UP), as Better Auth passes them on.
  INVITE_REQUIRED: INVITE_REQUIRED_MESSAGE,
  invite_required: INVITE_REQUIRED_MESSAGE,
  SIGN_UP_CLOSED: SIGN_UP_CLOSED_MESSAGE,
  sign_up_closed: SIGN_UP_CLOSED_MESSAGE,
};

/** What to tell people when a sign-in, sign-up or sign-out request fails. */
export function authErrorMessage(error: ApiError | null | undefined): string {
  if (!error || !error.status) return NETWORK_ERROR;
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return (error.code && BY_CODE[error.code]) || UNKNOWN_ERROR;
}

/** The `error` Better Auth adds to the sign-in page's address when a Google sign-in fails. */
export function googleErrorMessage(code: string): string {
  switch (code) {
    case 'account_not_linked':
      return 'This email already has an Inkframe password. Sign in with your password instead.';
    case 'access_denied':
      return 'Google sign-in was cancelled.';
    case 'invite_required':
      return INVITE_REQUIRED_MESSAGE;
    case 'sign_up_closed':
      return SIGN_UP_CLOSED_MESSAGE;
    default:
      return "Google sign-in didn't finish. Try again.";
  }
}
