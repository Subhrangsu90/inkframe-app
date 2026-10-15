import { Routes } from '@angular/router';
import { documentsRoutes } from './features/documents/documents.routes';

export const routes: Routes = [
  // Landing Page
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
    pathMatch: 'full',
  },
  ...documentsRoutes,
  // Settings page
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  // 404 - Not Found
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
