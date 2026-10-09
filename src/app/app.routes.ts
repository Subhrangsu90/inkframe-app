import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing/landing.component').then((m) => m.LandingComponent),
    pathMatch: 'full',
  },
  {
    path: 'docs',
    loadComponent: () =>
      import('./pages/docs/docs.component').then((m) => m.DocsComponent),
  },
  {
    path: 'doc/:id',
    loadComponent: () =>
      import('./pages/editor/editor.component').then((m) => m.EditorPageComponent),
  },
  {
    path: 'editor',
    redirectTo: 'docs',
    pathMatch: 'full',
  },
  {
    path: 's/:hash',
    loadComponent: () =>
      import('./pages/reader/reader.component').then((m) => m.ReaderComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
];
