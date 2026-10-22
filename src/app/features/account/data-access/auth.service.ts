import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CLOUD } from '@app/core/cloud';
import { AUTH_API_LOADER, type AuthApi, type AuthApiResult } from './auth-api';
import { NETWORK_ERROR, authErrorMessage } from './auth-errors';
// Types only: the schemas (and Zod) load on demand with the auth API module.
import type { AccountHint, AccountUser, SignInMethods } from './auth.schemas';

export type { AccountUser, SignInMethods } from './auth.schemas';

/** `unknown` until the browser has checked (and always on the server, which can't see the session). */
export type AuthStatus = 'unknown' | 'signed-out' | 'signed-in';

export type AuthOutcome = { ok: true } | { ok: false; message: string };

/**
 * Where this device remembers a sign-in between visits (AccountHintSchema):
 * who was signed in, or that a Google sign-in is under way. Without it the
 * app never contacts the server, so people who don't use accounts send
 * nothing anywhere.
 */
const HINT_KEY = 'inkframe-account';

/**
 * The optional Inkframe account: who is signed in, and signing in, up and
 * out. Accounts never change local documents; they only add sync (soon).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly cloud = inject(CLOUD);
  private readonly loadApi = inject(AUTH_API_LOADER);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private api?: Promise<AuthApi>;
  private methodsRequest?: Promise<SignInMethods>;
  private started = false;
  /**
   * Goes up with every sign-in, sign-up and sign-out, so a session check
   * that started before one can't undo it when its answer arrives late.
   */
  private actions = 0;

  /** Whether accounts appear in this build (see CLOUD and src/environments). */
  readonly enabled = this.cloud.enabled;

  private readonly state = signal<{ status: AuthStatus; user: AccountUser | null }>({
    status: 'unknown',
    user: null,
  });
  readonly status = computed(() => this.state().status);
  readonly user = computed(() => this.state().user);

  /**
   * Learns who is signed in. Call it after the first render (afterNextRender),
   * so the page the server rendered and the browser's first render agree.
   * Safe to call more than once; does nothing on the server.
   */
  start(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    const raw = this.enabled ? readHint() : null;
    if (!raw) {
      this.state.set({ status: 'signed-out', user: null });
      return;
    }
    void this.resume(raw);
  }

  /** Asks the server who is signed in. Offline, it keeps what this device knew. */
  async refresh(): Promise<void> {
    const actions = this.actions;
    try {
      const { data, error } = await (await this.client()).getSession();
      if (actions !== this.actions) return; // someone signed in or out meanwhile
      if (error) throw error;
      if (data?.user) this.signedInAs(data.user);
      else this.signedOut();
    } catch {
      if (this.status() === 'unknown') this.state.set({ status: 'signed-out', user: null });
    }
  }

  signIn(email: string, password: string): Promise<AuthOutcome> {
    this.actions++;
    return this.attempt((api) => api.signInEmail({ email, password }));
  }

  signUp(name: string, email: string, password: string): Promise<AuthOutcome> {
    this.actions++;
    return this.attempt((api) => api.signUpEmail({ name, email, password }));
  }

  /**
   * Sends the browser to Google. Afterwards Google and the server bring it
   * back to `returnTo` (a path in the app), or to the sign-in page with an
   * error. Resolves only when that could not start.
   */
  async continueWithGoogle(returnTo: string): Promise<AuthOutcome> {
    const origin = location.origin;
    writeHint({ pending: true, user: this.user() ?? undefined });
    try {
      const { error } = await (
        await this.client()
      ).signInSocial({
        provider: 'google',
        callbackURL: origin + returnTo,
        errorCallbackURL: `${origin}/signin?returnTo=${encodeURIComponent(returnTo)}`,
      });
      if (!error) return { ok: true };
      this.forgetPending();
      return { ok: false, message: authErrorMessage(error) };
    } catch {
      this.forgetPending();
      return { ok: false, message: NETWORK_ERROR };
    }
  }

  async signOut(): Promise<AuthOutcome> {
    this.actions++;
    try {
      const { error } = await (await this.client()).signOut();
      // 401: the session had already ended, which is what signing out wants.
      if (error && error.status !== 401) return { ok: false, message: authErrorMessage(error) };
    } catch {
      return { ok: false, message: NETWORK_ERROR };
    }
    this.signedOut();
    return { ok: true };
  }

  /** Which sign-in buttons to show. Asks the server once; email only when it can't be reached. */
  methods(): Promise<SignInMethods> {
    this.methodsRequest ??= this.client()
      .then((api) => api.getMethods())
      .catch(() => {
        this.methodsRequest = undefined;
        return { emailPassword: true, google: false };
      });
    return this.methodsRequest;
  }

  /** Shows who was signed in as soon as the hint is checked, then asks the server. */
  private async resume(raw: string): Promise<void> {
    const actions = this.actions;
    let hint: AccountHint | null;
    try {
      hint = (await this.client()).parseHint(raw);
    } catch {
      // The auth module couldn't load (offline before it was ever cached): try next visit.
      if (actions === this.actions) this.state.set({ status: 'signed-out', user: null });
      return;
    }
    if (actions !== this.actions) return; // someone signed in or out meanwhile
    if (!hint) {
      this.signedOut();
      return;
    }
    if (hint.user && this.status() === 'unknown') {
      this.state.set({ status: 'signed-in', user: hint.user });
    }
    await this.refresh();
  }

  private client(): Promise<AuthApi> {
    this.api ??= this.loadApi(this.cloud.apiUrl);
    return this.api;
  }

  private async attempt(
    call: (api: AuthApi) => Promise<AuthApiResult<{ user: AccountUser }>>,
  ): Promise<AuthOutcome> {
    try {
      const { data, error } = await call(await this.client());
      if (error || !data?.user) return { ok: false, message: authErrorMessage(error) };
      this.signedInAs(data.user);
      return { ok: true };
    } catch {
      return { ok: false, message: NETWORK_ERROR };
    }
  }

  private signedInAs(user: AccountUser): void {
    this.started = true;
    this.state.set({ status: 'signed-in', user });
    writeHint({ user });
  }

  private signedOut(): void {
    this.started = true;
    this.state.set({ status: 'signed-out', user: null });
    writeHint(null);
  }

  private forgetPending(): void {
    const user = this.user();
    writeHint(user ? { user } : null);
  }
}

/** The remembered hint as stored; AuthApi.parseHint checks it. */
function readHint(): string | null {
  try {
    return localStorage.getItem(HINT_KEY);
  } catch {
    return null;
  }
}

function writeHint(hint: AccountHint | null): void {
  try {
    if (hint) localStorage.setItem(HINT_KEY, JSON.stringify(hint));
    else localStorage.removeItem(HINT_KEY);
  } catch {
    // Storage unavailable: the next visit checks nothing and shows "Sign in".
  }
}
