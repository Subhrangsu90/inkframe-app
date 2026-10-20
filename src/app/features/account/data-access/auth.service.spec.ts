import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CLOUD } from '@app/core/cloud';
import { AUTH_API_LOADER, type AuthApi } from './auth-api';
import { NETWORK_ERROR } from './auth-errors';
import { AuthService } from './auth.service';

const HINT = 'inkframe-account';
const ada = { id: 'u_1', name: 'Ada', email: 'ada@example.test', image: null };
const PHOTO = 'https://lh3.googleusercontent.com/a/photo=s96-c';

/** A server stand-in: every call succeeds unless a test says otherwise. */
function fakeApi(): { [K in keyof AuthApi]: ReturnType<typeof vi.fn> } {
  return {
    getSession: vi.fn(async () => ({ data: { user: ada }, error: null })),
    signInEmail: vi.fn(async () => ({ data: { user: ada }, error: null })),
    signUpEmail: vi.fn(async () => ({ data: { user: ada }, error: null })),
    signInSocial: vi.fn(async () => ({
      data: { url: 'https://accounts.google.com' },
      error: null,
    })),
    signOut: vi.fn(async () => ({ data: { success: true }, error: null })),
  };
}

describe('AuthService', () => {
  let api: ReturnType<typeof fakeApi>;
  let loader: ReturnType<typeof vi.fn>;

  function setup(enabled = true): AuthService {
    TestBed.configureTestingModule({
      providers: [
        { provide: CLOUD, useValue: { enabled, apiUrl: 'http://api.test' } },
        { provide: AUTH_API_LOADER, useValue: loader },
      ],
    });
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    localStorage.clear();
    api = fakeApi();
    loader = vi.fn(async () => api);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('contacts nobody for people who never signed in on this device', () => {
    const auth = setup();
    expect(auth.status()).toBe('unknown');
    auth.start();
    expect(auth.status()).toBe('signed-out');
    expect(loader).not.toHaveBeenCalled();
  });

  it('shows the remembered user at once, then asks the server', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    const auth = setup();
    auth.start();
    expect(auth.status()).toBe('signed-in');
    expect(auth.user()).toEqual(ada);
    await vi.waitFor(() => expect(api.getSession).toHaveBeenCalled());
    expect(loader).toHaveBeenCalledWith('http://api.test');
  });

  it('forgets the user when the server says the session ended', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    api.getSession.mockResolvedValue({ data: null, error: null });
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(auth.status()).toBe('signed-out'));
    expect(localStorage.getItem(HINT)).toBeNull();
  });

  it('stays signed in while offline', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    api.getSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(api.getSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(auth.status()).toBe('signed-in');
    expect(localStorage.getItem(HINT)).not.toBeNull();
  });

  it('signs in and remembers who, for the next visit', async () => {
    const auth = setup();
    auth.start();
    expect(await auth.signIn('ada@example.test', 'secret-password')).toEqual({ ok: true });
    expect(api.signInEmail).toHaveBeenCalledWith({
      email: 'ada@example.test',
      password: 'secret-password',
    });
    expect(auth.user()).toEqual(ada);
    // The password is never stored.
    expect(localStorage.getItem(HINT)).toBe(JSON.stringify({ user: ada }));
  });

  it('explains a refused sign-in in plain words, and stays signed out', async () => {
    api.signInEmail.mockResolvedValue({
      data: null,
      error: {
        status: 401,
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      },
    });
    const auth = setup();
    auth.start();
    expect(await auth.signIn('ada@example.test', 'wrong')).toEqual({
      ok: false,
      message: "That email and password don't match an account.",
    });
    expect(auth.status()).toBe('signed-out');
  });

  it('says when the server cannot be reached', async () => {
    api.signUpEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const auth = setup();
    expect(await auth.signUp('Ada', 'ada@example.test', 'password1')).toEqual({
      ok: false,
      message: NETWORK_ERROR,
    });
  });

  it('signs out and forgets the user', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    const auth = setup();
    auth.start();
    expect(await auth.signOut()).toEqual({ ok: true });
    expect(auth.status()).toBe('signed-out');
    expect(localStorage.getItem(HINT)).toBeNull();
  });

  it('starts a Google sign-in that comes back to the app, and checks the session on return', async () => {
    const auth = setup();
    auth.start();
    expect(await auth.continueWithGoogle('/doc/doc_1')).toEqual({ ok: true });
    expect(api.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: `${location.origin}/doc/doc_1`,
      errorCallbackURL: `${location.origin}/signin?returnTo=${encodeURIComponent('/doc/doc_1')}`,
    });
    // Back from Google, the next visit asks the server.
    expect(JSON.parse(localStorage.getItem(HINT)!)).toEqual({ pending: true });
  });

  it('asks the server which sign-in buttons to show, once', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { emailPassword: true, google: true } }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const auth = setup();
    expect(await auth.methods()).toEqual({ emailPassword: true, google: true });
    await auth.methods();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://api.test/v1/auth/methods');
  });

  it('does nothing in builds without accounts', () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    const auth = setup(false);
    auth.start();
    expect(auth.status()).toBe('signed-out');
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps the profile photo from Google, and remembers it for the next visit', async () => {
    api.getSession.mockResolvedValue({ data: { user: { ...ada, image: PHOTO } }, error: null });
    localStorage.setItem(HINT, JSON.stringify({ pending: true }));
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(auth.user()?.image).toBe(PHOTO));
    expect(JSON.parse(localStorage.getItem(HINT)!).user.image).toBe(PHOTO);
  });

  it('drops photo addresses that are not https', async () => {
    const auth = setup();
    for (const image of [
      'javascript:alert(1)',
      'http://example.test/a.png',
      'data:image/png;base64,AA',
      'not a url',
    ]) {
      api.signInEmail.mockResolvedValue({ data: { user: { ...ada, image } }, error: null });
      await auth.signIn('ada@example.test', 'secret-password');
      expect(auth.user()?.image, image).toBeNull();
    }
  });

  it('reads users remembered before photos existed, and checks remembered photos again', () => {
    localStorage.setItem(
      HINT,
      JSON.stringify({ user: { id: 'u_1', name: 'Ada', email: 'ada@example.test' } }),
    );
    const auth = setup();
    auth.start();
    expect(auth.user()).toEqual(ada);

    TestBed.resetTestingModule();
    localStorage.setItem(HINT, JSON.stringify({ user: { ...ada, image: 'javascript:alert(1)' } }));
    const again = setup();
    again.start();
    expect(again.user()?.image).toBeNull();
  });
});
