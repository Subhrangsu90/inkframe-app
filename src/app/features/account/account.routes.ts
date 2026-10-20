import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn, type Routes } from '@angular/router';
import { CLOUD } from '@app/core/cloud';
import { STANDALONE_PAGE } from '@app/layout/standalone-page';
import { AuthService } from './data-access/auth.service';
import { safeReturnTo } from './account.paths';
import type { AuthMode } from './pages/auth-page/auth-page';

/** Builds without accounts (see CLOUD) have no sign-in pages: their URLs are 404s. */
const accountsEnabled: CanMatchFn = () => inject(CLOUD).enabled;

/** Someone already signed in goes where they were heading instead. */
const signedOutOnly: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  auth.start();
  return auth.status() === 'signed-in'
    ? inject(Router).parseUrl(safeReturnTo(route.queryParamMap.get('returnTo')))
    : true;
};

const authPage = (mode: AuthMode, title: string) => ({
  title,
  canMatch: [accountsEnabled],
  canActivate: [signedOutOnly],
  loadComponent: () => import('./pages/auth-page/auth-page').then((m) => m.AuthPage),
  data: { ...STANDALONE_PAGE, mode },
});

export const accountRoutes: Routes = [
  { path: 'signin', ...authPage('sign-in', 'Sign in') },
  { path: 'signup', ...authPage('sign-up', 'Create an account') },
];
