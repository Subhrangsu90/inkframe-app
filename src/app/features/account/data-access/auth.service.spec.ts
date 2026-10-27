import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CLOUD } from '@app/core/cloud';
import { AUTH_API_LOADER, type AuthApi } from './auth-api';
import { NETWORK_ERROR } from './auth-errors';
import { parseHint } from './auth.schemas';
import { AuthService } from './auth.service';

const HINT = 'inkframe-account';
const ada = { id: 'u_1', name: 'Ada', email: 'ada@example.test', image: null };
const PHOTO = 'https://lh3.googleusercontent.com/a/photo=s96-c';

/**
 * A server stand-in: every call succeeds unless a test says otherwise. Its
 * answers are already checked, as the real AuthApi's are; reading the hint
 * uses the real schema.
 */
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
    getMethods: vi.fn(async () => ({ emailPassword: true, google: true })),
    getConfig: vi.fn(async () => ({ signUp: 'invite', minAppVersion: '0.7.0', features: {} })),
    checkInvite: vi.fn(async () => undefined),
    parseHint: vi.fn(parseHint),
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

  it('contacts nobody for people who never signed in on this device', () => {
    const auth = setup();
    expect(auth.status()).toBe('unknown');
    auth.start();
    expect(auth.status()).toBe('signed-out');
    expect(loader).not.toHaveBeenCalled();
  });

  it('shows the remembered user as soon as it is checked, then asks the server', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    api.getSession.mockReturnValue(new Promise(() => {})); // the server hasn't answered yet
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(auth.status()).toBe('signed-in'));
    expect(auth.user()).toEqual(ada);
    expect(api.parseHint).toHaveBeenCalled();
    expect(api.getSession).toHaveBeenCalled();
    expect(loader).toHaveBeenCalledWith('http://api.test');
  });

  it('forgets a remembered sign-in that was edited into something else', async () => {
    localStorage.setItem(HINT, JSON.stringify({ user: { name: 'no id' } }));
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(auth.status()).toBe('signed-out'));
    expect(api.getSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(HINT)).toBeNull();
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

  it('keeps the profile photo, and remembers it for the next visit', async () => {
    api.getSession.mockResolvedValue({ data: { user: { ...ada, image: PHOTO } }, error: null });
    localStorage.setItem(HINT, JSON.stringify({ pending: true }));
    const auth = setup();
    auth.start();
    await vi.waitFor(() => expect(auth.user()?.image).toBe(PHOTO));
    expect(JSON.parse(localStorage.getItem(HINT)!).user.image).toBe(PHOTO);
  });

  it('asks the server which sign-in buttons to show, once', async () => {
    const auth = setup();
    expect(await auth.methods()).toEqual({ emailPassword: true, google: true });
    await auth.methods();
    expect(api.getMethods).toHaveBeenCalledTimes(1);
  });

  it('offers email only when the server cannot say, and asks again next time', async () => {
    api.getMethods.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const auth = setup();
    expect(await auth.methods()).toEqual({ emailPassword: true, google: false });
    expect(await auth.methods()).toEqual({ emailPassword: true, google: true });
  });

  it('asks the server who may sign up, once', async () => {
    const auth = setup();
    expect((await auth.config()).signUp).toBe('invite');
    await auth.config();
    expect(api.getConfig).toHaveBeenCalledTimes(1);
  });

  it('assumes open sign-up when the server cannot say, and asks again next time', async () => {
    api.getConfig.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const auth = setup();
    expect((await auth.config()).signUp).toBe('open');
    expect((await auth.config()).signUp).toBe('invite');
  });

  it('checks invite codes, in words people can act on when they fail', async () => {
    const auth = setup();
    expect(await auth.checkInvite('7K3M-Q9TD-XW2P-4HNA')).toEqual({ ok: true });
    expect(api.checkInvite).toHaveBeenCalledWith('7K3M-Q9TD-XW2P-4HNA');

    // The server's refusal, as getJson throws it (ApiRequestError).
    api.checkInvite.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { status: 400, code: 'invalid_invite' }),
    );
    const refused = await auth.checkInvite('WRONG');
    expect(refused).toEqual({ ok: false, message: expect.stringMatching(/invite code/) });

    api.checkInvite.mockRejectedValueOnce(Object.assign(new Error('slow'), { status: 429 }));
    expect(await auth.checkInvite('AGAIN')).toEqual({
      ok: false,
      message: expect.stringMatching(/Too many attempts/),
    });

    api.checkInvite.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await auth.checkInvite('OFFLINE')).toEqual({ ok: false, message: NETWORK_ERROR });
  });

  it('does nothing in builds without accounts', () => {
    localStorage.setItem(HINT, JSON.stringify({ user: ada }));
    const auth = setup(false);
    auth.start();
    expect(auth.status()).toBe('signed-out');
    expect(loader).not.toHaveBeenCalled();
  });
});
