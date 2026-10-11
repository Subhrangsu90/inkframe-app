import { Routes } from '@angular/router';
import type { EditorView } from './pages/editor/editor';

export const routes: Routes = [
  // Landing Page
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing/landing').then((m) => m.Landing),
    pathMatch: 'full',
  },
  // All docs list page
  {
    path: 'docs',
    loadComponent: () =>
      import('./pages/docs/docs').then((m) => m.Docs),
  },
  // A single doc/editor page
  {
    path: 'doc/:id',
    loadComponent: () =>
      import('./pages/editor/editor').then((m) => m.EditorView),
    // Save debounced edits before the editor is destroyed: once destruction
    // starts, the editor can no longer emit them.
    canDeactivate: [(page: EditorView) => (page.flushPendingEdits(), true)],
  },
  // Redirect editor/ to docs
  {
    path: 'editor',
    redirectTo: 'docs',
    pathMatch: 'full',
  },
  // Document reader page (view mode, no edit). Share links carry the
  // document in the fragment (/s#<payload>); /s/:hash serves older links
  // and local document ids.
  {
    path: 's',
    loadComponent: () =>
      import('./pages/reader/reader').then((m) => m.Reader),
  },
  {
    path: 's/:hash',
    loadComponent: () =>
      import('./pages/reader/reader').then((m) => m.Reader),
  },
  // Settings page
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.Settings),
  },
  // 404 - Not Found
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
