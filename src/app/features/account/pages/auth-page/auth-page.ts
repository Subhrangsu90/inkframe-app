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
import { ToastService } from '@app/shared/ui/toast/toast';
import type { z } from 'zod';
import {
  AuthService,
  type AuthOutcome,
  type SignUpMode,
} from '@app/features/account/data-access/auth.service';
import { googleErrorMessage } from '@app/features/account/data-access/auth-errors';
import {
  type FormField,
  InviteFormSchema,
  MIN_PASSWORD,
  SignInFormSchema,
  SignUpFormSchema,
  fieldErrors,
} from '@app/features/account/data-access/auth.schemas';
import {
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  returnToParams,
  safeReturnTo,
} from '@app/features/account/account.paths';

export type AuthMode = 'sign-in' | 'sign-up';

type Field = FormField;

const FIELD_ORDER: readonly Field[] = ['invite', 'name', 'email', 'password'];

const SignUpWithInviteSchema = SignUpFormSchema.extend(InviteFormSchema.shape);

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

  readonly invite = signal('');
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly busy = signal<'form' | 'google' | null>(null);
  readonly googleAvailable = signal(false);
  /** Who may create an account (the server's `/v1/config`); open until it answers. */
  readonly signUpMode = signal<SignUpMode>('open');
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
      if (this.isSignUp)
        void this.auth.config().then((config) => this.signUpMode.set(config.signUp));
    });
  }

  /** Whether creating an account here needs an invite code first (by email or Google). */
  protected needsInvite(): boolean {
    return this.isSignUp && this.signUpMode() === 'invite';
  }

  protected update(field: Field, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const fields = {
      invite: this.invite,
      name: this.name,
      email: this.email,
      password: this.password,
    };
    fields[field].set(value);
    if (this.fieldErrors()[field]) {
      this.fieldErrors.update((errors) => ({ ...errors, [field]: undefined }));
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.formError.set(null);
    // Zod checks the fields (auth.schemas.ts); the server checks them again.
    const form = { name: this.name(), email: this.email(), password: this.password() };
    let attempt: () => Promise<AuthOutcome>;
    let invite: string | null = null;
    if (this.needsInvite()) {
      const fields = this.check(
        SignUpWithInviteSchema.safeParse({ ...form, invite: this.invite() }),
      );
      if (!fields) return;
      invite = fields.invite;
      attempt = () => this.auth.signUp(fields.name, fields.email, fields.password);
    } else if (this.isSignUp) {
      const fields = this.check(SignUpFormSchema.safeParse(form));
      if (!fields) return;
      attempt = () => this.auth.signUp(fields.name, fields.email, fields.password);
    } else {
      const fields = this.check(SignInFormSchema.safeParse(form));
      if (!fields) return;
      attempt = () => this.auth.signIn(fields.email, fields.password);
    }

    this.busy.set('form');
    if (invite !== null && !(await this.inviteAccepted(invite))) return;
    const outcome = await attempt();
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
    let invite: string | null = null;
    if (this.needsInvite()) {
      // A new Google account needs the code too; the email fields don't matter here.
      const fields = this.check(InviteFormSchema.safeParse({ invite: this.invite() }));
      if (!fields) return;
      invite = fields.invite;
    }
    this.busy.set('google');
    if (invite !== null && !(await this.inviteAccepted(invite))) return;
    const outcome = await this.auth.continueWithGoogle(this.returnTo);
    // On success the browser is already on its way to Google.
    if (!outcome.ok) {
      this.busy.set(null);
      this.showError(outcome.message);
    }
  }

  /**
   * Has the server check the invite code (it then holds it for the sign-up).
   * When it doesn't work, shows why at the code's field, focuses it and ends
   * the busy state.
   */
  private async inviteAccepted(code: string): Promise<boolean> {
    const checked = await this.auth.checkInvite(code);
    if (checked.ok) return true;
    this.busy.set(null);
    this.fieldErrors.set({ invite: checked.message });
    this.host.nativeElement.querySelector<HTMLInputElement>('#auth-invite')?.focus();
    return false;
  }

  /**
   * The checked fields, or null after showing each field's first problem
   * and moving focus to the first field that has one.
   */
  private check<T>(result: z.ZodSafeParseResult<T>): T | null {
    if (result.success) {
      this.fieldErrors.set({});
      return result.data;
    }
    const errors = fieldErrors(result.error);
    this.fieldErrors.set(errors);
    const first = FIELD_ORDER.find((field) => errors[field]);
    this.host.nativeElement.querySelector<HTMLInputElement>(`#auth-${first}`)?.focus();
    return null;
  }

  /** Shows a problem with the attempt and moves focus to it, so screen readers announce it. */
  private showError(message: string): void {
    this.formError.set(message);
    setTimeout(() => this.errorBox()?.nativeElement.focus());
  }
}
