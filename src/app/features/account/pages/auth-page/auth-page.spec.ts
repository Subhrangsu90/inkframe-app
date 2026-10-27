import { describe, expect, it, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  AuthService,
  type AuthOutcome,
  type SignUpMode,
} from '@app/features/account/data-access/auth.service';
import { AuthPage } from './auth-page';

@Component({ template: '' })
class Blank {}

/** An AuthService stand-in that records what the page asks for. */
function fakeAuth(
  outcome: AuthOutcome = { ok: true },
  google = false,
  signUp: SignUpMode = 'open',
  invite: AuthOutcome = { ok: true },
) {
  return {
    enabled: true,
    status: signal('signed-out'),
    user: signal(null),
    start: vi.fn(),
    methods: vi.fn(async () => ({ emailPassword: true, google })),
    config: vi.fn(async () => ({ signUp, minAppVersion: '0.0.0', features: {} })),
    checkInvite: vi.fn(async () => invite),
    signIn: vi.fn(async () => outcome),
    signUp: vi.fn(async () => outcome),
    continueWithGoogle: vi.fn(async () => ({ ok: true })),
  };
}

async function open(url: string, auth = fakeAuth()) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'signin', component: AuthPage, data: { mode: 'sign-in' } },
        { path: 'signup', component: AuthPage, data: { mode: 'sign-up' } },
        { path: '**', component: Blank },
      ]),
      { provide: AuthService, useValue: auth },
    ],
  });
  const router = TestBed.inject(Router);
  const { RouterTestingHarness } = await import('@angular/router/testing');
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  const page = harness.routeNativeElement!;
  const type = (selector: string, value: string) => {
    const input = page.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
  };
  return { harness, page, router, auth, type, submit };
}

describe('AuthPage', () => {
  it('signs in and goes back to where the person came from', async () => {
    const { page, router, auth, type, submit, harness } = await open('/signin?returnTo=/doc/doc_1');
    expect(page.querySelector('h1')!.textContent).toContain('Sign in');
    expect(page.querySelector('#auth-name')).toBeNull();
    expect(page.querySelector<HTMLInputElement>('#auth-password')!.autocomplete).toBe(
      'current-password',
    );

    type('#auth-email', '  ada@example.test ');
    type('#auth-password', 'secret-password');
    await submit();
    await harness.fixture.whenStable();

    expect(auth.signIn).toHaveBeenCalledWith('ada@example.test', 'secret-password');
    expect(router.url).toBe('/doc/doc_1');
  });

  it('points out empty and mistyped fields before asking the server, and focuses the first', async () => {
    const { page, auth, type, submit } = await open('/signup');
    expect(page.querySelector('h1')!.textContent).toContain('Create your account');

    type('#auth-email', 'ada@example');
    type('#auth-password', 'short');
    await submit();

    expect(auth.signUp).not.toHaveBeenCalled();
    expect(page.querySelector('#auth-name-error')!.textContent).toContain('Enter your name');
    expect(page.querySelector('#auth-email-error')!.textContent).toContain('name@example.com');
    expect(page.querySelector('#auth-password-error')!.textContent).toContain('at least 8');
    const name = page.querySelector<HTMLInputElement>('#auth-name')!;
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('auth-name-error');
    expect(document.activeElement).toBe(name);
  });

  it("shows the server's refusal as an alert, and stays on the page", async () => {
    const auth = fakeAuth({ ok: false, message: 'There is already an account with this email.' });
    const { page, router, type, submit, harness } = await open('/signup', auth);
    type('#auth-name', 'Ada');
    type('#auth-email', 'ada@example.test');
    type('#auth-password', 'long-enough');
    await submit();
    await new Promise((r) => setTimeout(r));
    await harness.fixture.whenStable();

    expect(auth.signUp).toHaveBeenCalledWith('Ada', 'ada@example.test', 'long-enough');
    const alert = page.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('already an account');
    expect(document.activeElement).toBe(alert);
    expect(router.url).toBe('/signup');
  });

  it('offers Google only when the server has it', async () => {
    const without = await open('/signin');
    expect(without.page.textContent).not.toContain('Continue with Google');

    TestBed.resetTestingModule();
    const auth = fakeAuth({ ok: true }, true);
    const { page, harness } = await open('/signin?returnTo=/settings', auth);
    await vi.waitFor(() => expect(auth.methods).toHaveBeenCalled());
    await harness.fixture.whenStable();
    const google = [...page.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Continue with Google'),
    )!;
    google.click();
    expect(auth.continueWithGoogle).toHaveBeenCalledWith('/settings');
  });

  it('explains a failed Google sign-in when it comes back with an error', async () => {
    const { page } = await open('/signin?error=account_not_linked');
    expect(page.querySelector('[role="alert"]')!.textContent).toContain(
      'Sign in with your password',
    );
  });

  describe('while sign-up is invite-only', () => {
    /** /signup once the server has said sign-up needs an invite. */
    async function openInviteOnly(invite: AuthOutcome = { ok: true }) {
      const auth = fakeAuth({ ok: true }, true, 'invite', invite);
      const opened = await open('/signup', auth);
      await vi.waitFor(() => expect(auth.config).toHaveBeenCalled());
      await opened.harness.fixture.whenStable();
      const google = () =>
        [...opened.page.querySelectorAll('button')].find((b) =>
          b.textContent!.includes('Continue with Google'),
        )!;
      return { ...opened, google };
    }

    const fillIn = (type: (selector: string, value: string) => void) => {
      type('#auth-name', 'Ada');
      type('#auth-email', 'ada@example.test');
      type('#auth-password', 'long-enough');
    };

    it('asks for the code first, above Google, and checks it before signing up', async () => {
      const { page, auth, type, submit, harness } = await openInviteOnly();
      const field = page.querySelector<HTMLInputElement>('#auth-invite')!;
      const googleButton = page.querySelector('.google-btn')!;
      // The code comes before both ways of signing up.
      expect(field.compareDocumentPosition(googleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );

      fillIn(type);
      await submit();
      expect(auth.checkInvite).not.toHaveBeenCalled();
      expect(auth.signUp).not.toHaveBeenCalled();
      expect(page.querySelector('#auth-invite-error')!.textContent).toContain('invite code');
      expect(document.activeElement).toBe(field);

      type('#auth-invite', ' 7k3m-q9td-xw2p-4hna ');
      await submit();
      await harness.fixture.whenStable();
      expect(auth.checkInvite).toHaveBeenCalledWith('7k3m-q9td-xw2p-4hna');
      expect(auth.signUp).toHaveBeenCalledWith('Ada', 'ada@example.test', 'long-enough');
    });

    it("shows a code that doesn't work at its field, and creates nothing", async () => {
      const { page, auth, type, submit, harness } = await openInviteOnly({
        ok: false,
        message: "This invite code doesn't work.",
      });
      type('#auth-invite', 'WRONG-CODE');
      fillIn(type);
      await submit();
      await harness.fixture.whenStable();
      expect(auth.signUp).not.toHaveBeenCalled();
      expect(page.querySelector('#auth-invite-error')!.textContent).toContain("doesn't work");
      expect(document.activeElement).toBe(page.querySelector('#auth-invite'));
      expect(page.querySelector<HTMLButtonElement>('.submit-btn')!.disabled).toBe(false);
    });

    it('needs the code for Google too, but not the email fields', async () => {
      const { auth, type, google, harness } = await openInviteOnly();
      google().click();
      await harness.fixture.whenStable();
      expect(auth.continueWithGoogle).not.toHaveBeenCalled();

      type('#auth-invite', '7K3M-Q9TD-XW2P-4HNA');
      google().click();
      await vi.waitFor(() => expect(auth.continueWithGoogle).toHaveBeenCalledWith('/docs'));
      expect(auth.checkInvite).toHaveBeenCalledWith('7K3M-Q9TD-XW2P-4HNA');
    });
  });

  it('says so when new accounts are closed, and offers no way to make one', async () => {
    const auth = fakeAuth({ ok: true }, true, 'closed');
    const { page, harness } = await open('/signup', auth);
    await vi.waitFor(() => expect(auth.config).toHaveBeenCalled());
    await harness.fixture.whenStable();
    expect(page.querySelector('.signup-closed')!.textContent).toContain("aren't open");
    expect(page.querySelector('form')).toBeNull();
    expect(page.textContent).not.toContain('Continue with Google');
    expect(page.textContent).toContain('Sign in');
  });

  it("doesn't ask the sign-in page who may sign up, nor show a code field there", async () => {
    const auth = fakeAuth({ ok: true }, false, 'invite');
    const { page } = await open('/signin', auth);
    expect(auth.config).not.toHaveBeenCalled();
    expect(page.querySelector('#auth-invite')).toBeNull();
  });

  it('explains an uninvited Google sign-up when it comes back', async () => {
    const { page } = await open('/signin?error=invite_required');
    expect(page.querySelector('[role="alert"]')!.textContent).toContain('needs an invite code');
  });

  it('always offers to go on without an account, and never back to another site', async () => {
    const { page } = await open('/signin?returnTo=https://evil.example');
    const skip = [...page.querySelectorAll('a')].find((a) =>
      a.textContent!.includes('Continue without an account'),
    )!;
    expect(skip.getAttribute('href')).toBe('/docs');
    const create = [...page.querySelectorAll('a')].find((a) => a.textContent!.includes('Create'))!;
    expect(create.getAttribute('href')).toBe('/signup');
  });
});
