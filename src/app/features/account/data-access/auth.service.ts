import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CLOUD } from '@app/core/cloud';
import { AUTH_API_LOADER, type AuthApi, type AuthApiResult, type SessionUser } from './auth-api';
import { NETWORK_ERROR, authErrorMessage } from './auth-errors';

/** `unknown` until the browser has checked (and always on the server, which can't see the session). */
export type AuthStatus = 'unknown' | 'signed-out' | 'signed-in';

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  /** A profile photo (from Google sign-in), or null. Always an https address. */
  image: string | null;
}

export type AuthOutcome = { ok: true } | { ok: false; message: string };

/** Which sign-in methods the server offers (GET /v1/auth/methods). */
export interface SignInMethods {
  emailPassword: boolean;
  google: boolean;
}

/**
 * What this device remembers between visits: who was signed in, or that a
 * Google sign-in is under way. Without it the app never contacts the server,
 * so people who don't use accounts send nothing anywhere.
 */
interface AccountHint {
  user?: AccountUser;
  pending?: true;
}

const HINT_KEY = 'inkframe-account';

/** Only https photos: no `javascript:`, `data:` or plain-http (mixed content) addresses. */
function safeImage(image: unknown): string | null {
  if (typeof image !== 'string') return null;
  try {
    return new URL(image).protocol === 'https:' ? image : null;
  } catch {
    return null;
  }
}

const toUser = ({ id, name, email, image }: SessionUser): AccountUser => ({
  id,
  name,
  email,
  image: safeImage(image),
});

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

  /** Whether accounts appear in this build (see CLOUD). */
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
    const hint = this.enabled ? readHint() : null;
    if (!hint) {
      this.state.set({ status: 'signed-out', user: null });
      return;
    }
    // Show who was signed in at once; the server confirms below.
    if (hint.user) this.state.set({ status: 'signed-in', user: hint.user });
    void this.refresh();
  }

  /** Asks the server who is signed in. Offline, it keeps what this device knew. */
  async refresh(): Promise<void> {
    try {
      const { data, error } = await (await this.client()).getSession();
      if (error) throw error;
      if (data?.user) this.signedInAs(data.user);
      else this.signedOut();
    } catch {
      if (this.status() === 'unknown') this.state.set({ status: 'signed-out', user: null });
    }
  }

  signIn(email: string, password: string): Promise<AuthOutcome> {
    return this.attempt((api) => api.signInEmail({ email, password }));
  }

  signUp(name: string, email: string, password: string): Promise<AuthOutcome> {
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
    this.methodsRequest ??= fetch(`${this.cloud.apiUrl}/v1/auth/methods`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: { data: SignInMethods }) => body.data)
      .catch(() => {
        this.methodsRequest = undefined;
        return { emailPassword: true, google: false };
      });
    return this.methodsRequest;
  }

  private client(): Promise<AuthApi> {
    this.api ??= this.loadApi(this.cloud.apiUrl);
    return this.api;
  }

  private async attempt(
    call: (api: AuthApi) => Promise<AuthApiResult<{ user: SessionUser }>>,
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

  private signedInAs(sessionUser: SessionUser): void {
    const user = toUser(sessionUser);
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

function readHint(): AccountHint | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    const hint = raw ? (JSON.parse(raw) as AccountHint) : null;
    if (!hint || !(hint.pending || hint.user?.id)) return null;
    // Saved before photos existed, or edited by hand: check the photo again.
    return hint.user
      ? { ...hint, user: { ...hint.user, image: safeImage(hint.user.image) } }
      : hint;
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
