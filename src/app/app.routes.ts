import { Routes } from '@angular/router';
import { accountRoutes } from './features/account/account.routes';
import { documentsRoutes } from './features/documents/documents.routes';
import { STANDALONE_PAGE } from './layout/standalone-page';
import type { PageMetaData } from './core/page-meta';

export const routes: Routes = [
  // Landing Page
  // The only page search engines index; it keeps the site title (core/page-meta.ts).
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
    pathMatch: 'full',
    data: { ...STANDALONE_PAGE, meta: { index: true } satisfies PageMetaData },
  },
  ...documentsRoutes,
  // Sign in and create an account (only in builds with accounts; see core/cloud.ts)
  ...accountRoutes,
  // Settings page
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  // 404 - Not Found
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
