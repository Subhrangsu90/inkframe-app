import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing/landing').then((m) => m.Landing),
    pathMatch: 'full',
  },
  {
    path: 'docs',
    loadComponent: () =>
      import('./pages/docs/docs').then((m) => m.Docs),
  },
  {
    path: 'doc/:id',
    loadComponent: () =>
      import('./pages/editor/editor').then((m) => m.EditorView),
  },
  {
    path: 'editor',
    redirectTo: 'docs',
    pathMatch: 'full',
  },
  {
    path: 's/:hash',
    loadComponent: () =>
      import('./pages/reader/reader').then((m) => m.Reader),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.Settings),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
