import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { ToastService } from '@app/shared/ui';
import { AuthService } from '@app/features/account/data-access/auth.service';
import { googleErrorMessage } from '@app/features/account/data-access/auth-errors';
import {
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  returnToParams,
  safeReturnTo,
} from '@app/features/account/account.paths';

export type AuthMode = 'sign-in' | 'sign-up';

type Field = 'name' | 'email' | 'password';

/** Loose on purpose: the server has the final say; this only catches typos early. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

/**
 * Sign in (/signin) and create an account (/signup): one page, two modes.
 * An account is optional; the page always offers to go on without one.
 */
@Component({
  selector: 'ink-auth-page',
  imports: [RouterLink, InkIcon],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly route = inject(ActivatedRoute).snapshot;

  readonly isSignUp = (this.route.data['mode'] as AuthMode) === 'sign-up';
  /** Where to go once signed in, or when going on without an account. */
  readonly returnTo = safeReturnTo(this.route.queryParamMap.get('returnTo'));
  /** `returnTo` as a link target, query string included. */
  readonly returnLink = this.router.parseUrl(this.returnTo);
  readonly returnParams = returnToParams(this.returnTo);
  readonly signInPath = SIGN_IN_PATH;
  readonly signUpPath = SIGN_UP_PATH;
  readonly minPassword = MIN_PASSWORD;

  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly busy = signal<'form' | 'google' | null>(null);
  readonly googleAvailable = signal(false);
  readonly fieldErrors = signal<Partial<Record<Field, string>>>({});
  /** A problem with the whole attempt; a failed Google sign-in comes back with `?error=`. */
  readonly formError = signal<string | null>(
    this.route.queryParamMap.has('error')
      ? googleErrorMessage(this.route.queryParamMap.get('error') ?? '')
      : null,
  );

  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  constructor() {
    afterNextRender(() => {
      void this.auth.methods().then((methods) => this.googleAvailable.set(methods.google));
    });
  }

  protected update(field: Field, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    ({ name: this.name, email: this.email, password: this.password })[field].set(value);
    if (this.fieldErrors()[field]) {
      this.fieldErrors.update((errors) => ({ ...errors, [field]: undefined }));
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.formError.set(null);
    const invalid = this.validate();
    if (invalid) {
      this.host.nativeElement.querySelector<HTMLInputElement>(`#auth-${invalid}`)?.focus();
      return;
    }

    this.busy.set('form');
    const email = this.email().trim();
    const outcome = this.isSignUp
      ? await this.auth.signUp(this.name().trim(), email, this.password())
      : await this.auth.signIn(email, this.password());
    this.busy.set(null);

    if (!outcome.ok) {
      this.showError(outcome.message);
      return;
    }
    this.toast.success(this.isSignUp ? 'Account created. You are signed in.' : 'Signed in.');
    await this.router.navigateByUrl(this.returnTo);
  }

  protected async continueWithGoogle(): Promise<void> {
    if (this.busy()) return;
    this.formError.set(null);
    this.busy.set('google');
    const outcome = await this.auth.continueWithGoogle(this.returnTo);
    // On success the browser is already on its way to Google.
    if (!outcome.ok) {
      this.busy.set(null);
      this.showError(outcome.message);
    }
  }

  /** Checks the fields; returns the first one with a problem, or null. */
  private validate(): Field | null {
    const errors: Partial<Record<Field, string>> = {};
    if (this.isSignUp && !this.name().trim()) errors.name = 'Enter your name.';

    const email = this.email().trim();
    if (!email) errors.email = 'Enter your email address.';
    else if (!EMAIL.test(email)) errors.email = 'Enter an email address like name@example.com.';

    const password = this.password();
    if (!password) errors.password = this.isSignUp ? 'Choose a password.' : 'Enter your password.';
    else if (this.isSignUp && password.length < MIN_PASSWORD) {
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    } else if (password.length > MAX_PASSWORD) {
      errors.password = `Use at most ${MAX_PASSWORD} characters.`;
    }

    this.fieldErrors.set(errors);
    return (['name', 'email', 'password'] as const).find((field) => errors[field]) ?? null;
  }

  /** Shows a problem with the attempt and moves focus to it, so screen readers announce it. */
  private showError(message: string): void {
    this.formError.set(message);
    setTimeout(() => this.errorBox()?.nativeElement.focus());
  }
}
