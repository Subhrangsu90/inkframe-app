import { describe, expect, it } from 'vitest';
import {
  AccountUserSchema,
  SessionSchema,
  SignInFormSchema,
  SignUpFormSchema,
  fieldErrors,
  parseHint,
} from './auth.schemas';

const ada = { id: 'u_1', name: 'Ada', email: 'ada@example.test' };

describe('AccountUserSchema', () => {
  it('keeps what the app needs and drops the rest', () => {
    expect(
      AccountUserSchema.parse({ ...ada, emailVerified: false, createdAt: '2026-10-20', role: 'x' }),
    ).toEqual({ ...ada, image: null });
  });

  it('keeps https photos only', () => {
    const photo = 'https://lh3.googleusercontent.com/a/photo=s96-c';
    expect(AccountUserSchema.parse({ ...ada, image: photo }).image).toBe(photo);
    for (const image of [
      'javascript:alert(1)',
      'http://example.test/a.png',
      'data:image/png;base64,AA',
      'not a url',
      42,
      null,
    ]) {
      expect(AccountUserSchema.parse({ ...ada, image }).image, String(image)).toBeNull();
    }
  });

  it('refuses a user without an id', () => {
    expect(AccountUserSchema.safeParse({ name: 'Ada', email: 'ada@example.test' }).success).toBe(
      false,
    );
  });

  it('reads a signed-out session as null', () => {
    expect(SessionSchema.parse(null)).toBeNull();
    expect(SessionSchema.parse({ user: ada, session: { token: 'x' } })).toEqual({
      user: { ...ada, image: null },
    });
  });
});

describe('parseHint', () => {
  it('reads a remembered user, and a Google sign-in under way', () => {
    expect(parseHint(JSON.stringify({ user: ada }))).toEqual({ user: { ...ada, image: null } });
    expect(parseHint(JSON.stringify({ pending: true }))).toEqual({ pending: true });
  });

  it('ignores anything missing, unreadable or edited into something else', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '{}',
      '{"pending":false}',
      JSON.stringify({ user: { name: 'no id' } }),
      JSON.stringify({ user: ada, password: 'never stored' }).replace('"u_1"', '42'),
    ]) {
      expect(parseHint(raw), String(raw)).toBeNull();
    }
  });

  it('checks a remembered photo again', () => {
    const hint = parseHint(JSON.stringify({ user: { ...ada, image: 'javascript:alert(1)' } }));
    expect(hint?.user?.image).toBeNull();
  });
});

describe('the sign-in and sign-up forms', () => {
  it('trims the email and name, and keeps the password as typed', () => {
    expect(
      SignUpFormSchema.parse({
        name: '  Ada ',
        email: ' ada@example.test ',
        password: ' pass word ',
      }),
    ).toEqual({ name: 'Ada', email: 'ada@example.test', password: ' pass word ' });
  });

  it('says what is missing, one message per field', () => {
    const result = SignUpFormSchema.safeParse({ name: ' ', email: '', password: '' });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toEqual({
      name: 'Enter your name.',
      email: 'Enter your email address.',
      password: 'Choose a password.',
    });
  });

  it('catches a mistyped email and a short new password', () => {
    const result = SignUpFormSchema.safeParse({
      name: 'Ada',
      email: 'ada@example',
      password: 'short',
    });
    expect(fieldErrors(result.error!)).toEqual({
      email: 'Enter an email address like name@example.com.',
      password: 'Use at least 8 characters.',
    });
  });

  it('lets an existing password of any length through to the server on sign-in', () => {
    expect(
      SignInFormSchema.safeParse({ email: 'ada@example.test', password: 'short' }).success,
    ).toBe(true);
    const empty = SignInFormSchema.safeParse({ email: 'ada@example.test', password: '' });
    expect(fieldErrors(empty.error!)).toEqual({ password: 'Enter your password.' });
  });

  it('refuses passwords over 128 characters', () => {
    const long = SignInFormSchema.safeParse({
      email: 'ada@example.test',
      password: 'x'.repeat(129),
    });
    expect(fieldErrors(long.error!).password).toBe('Use at most 128 characters.');
  });
});
