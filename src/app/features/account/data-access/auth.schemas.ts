import { z } from '@app/core/zod';

/*
 * Zod schemas for accounts: what the server sends, what this device
 * remembers, and the sign-in and sign-up forms. Loaded on demand only (by
 * the auth API module and the sign-in page); AuthService imports types from
 * here, never values, so Zod stays out of the first page load.
 */

/**
 * A profile photo: kept only when it is an https address (no `javascript:`,
 * `data:` or mixed content); missing or anything else becomes null.
 * `.optional()` first: in Zod 4 a transformed field is otherwise required.
 */
const photo = z
  .unknown()
  .optional()
  .transform((value): string | null => {
    if (typeof value !== 'string') return null;
    try {
      return new URL(value).protocol === 'https:' ? value : null;
    } catch {
      return null;
    }
  });

/** The signed-in user, as the app keeps it. Extra fields from the server are dropped. */
export const AccountUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  image: photo,
});
export type AccountUser = z.output<typeof AccountUserSchema>;

/** Better Auth's session and sign-in answers carry the user; signed out, the session is null. */
export const UserPayloadSchema = z.object({ user: AccountUserSchema });
export const SessionSchema = UserPayloadSchema.nullable();

/** GET /v1/auth/methods: which sign-in buttons to show. */
export const SignInMethodsSchema = z.object({
  emailPassword: z.boolean(),
  google: z.boolean(),
});
export type SignInMethods = z.output<typeof SignInMethodsSchema>;

/** Who may create an account: anyone, people with an invite code, or nobody. */
export const SIGN_UP_MODES = ['open', 'invite', 'closed'] as const;
export type SignUpMode = (typeof SIGN_UP_MODES)[number];

/** GET /v1/config: what the server offers now. */
export const AppConfigSchema = z.object({
  signUp: z.enum(SIGN_UP_MODES),
  minAppVersion: z.string(),
  features: z.record(z.string(), z.boolean()),
});
export type AppConfig = z.output<typeof AppConfigSchema>;

/** POST /v1/invites/check: an accepted code answers with no data. */
export const InviteAcceptedSchema = z.null();

/**
 * What this device remembers between visits (localStorage): who was signed
 * in, or that a Google sign-in is under way. Never a password or a token.
 */
export const AccountHintSchema = z
  .object({
    user: AccountUserSchema.optional(),
    pending: z.literal(true).optional(),
  })
  .refine((hint) => hint.user || hint.pending);
export type AccountHint = z.output<typeof AccountHintSchema>;

/** The remembered hint, or null when it is missing, unreadable or edited into something else. */
export function parseHint(raw: string | null): AccountHint | null {
  if (!raw) return null;
  try {
    const result = AccountHintSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ── Forms ────────────────────────────────────────────────────────────

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter an email address like name@example.com.'));

/** /signin. Any password length: an older account may predate the rules. */
export const SignInFormSchema = z.object({
  email,
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(MAX_PASSWORD, `Use at most ${MAX_PASSWORD} characters.`),
});

/** /signup. The same limits as the server (Better Auth: 8 to 128 characters). */
export const SignUpFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100, 'Use at most 100 characters.'),
  email,
  password: z
    .string()
    .min(1, 'Choose a password.')
    .min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`)
    .max(MAX_PASSWORD, `Use at most ${MAX_PASSWORD} characters.`),
});

/** The invite code, while sign-up needs one; the server checks it (case and dashes don't matter). */
export const InviteFormSchema = z.object({
  invite: z.string().trim().min(1, 'Enter your invite code.').max(64, 'That code is too long.'),
});

export type FormField = 'invite' | 'name' | 'email' | 'password';

/** The first problem with each field, to show next to it. */
export function fieldErrors(error: z.ZodError): Partial<Record<FormField, string>> {
  const errors: Partial<Record<FormField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as FormField;
    errors[field] ??= issue.message;
  }
  return errors;
}
