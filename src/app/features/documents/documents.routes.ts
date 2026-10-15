import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { STANDALONE_PAGE } from '@app/layout/standalone-page';
import { DocumentLibrary } from './data-access/document-library';
import { docPath } from './documents.paths';
import type { EditorView } from './pages/editor/editor';

/** Creates an empty document and opens it; storage errors lead to the library. */
async function openNewDocument() {
  const router = inject(Router);
  const library = inject(DocumentLibrary);
  try {
    const id = await library.createDocWithoutOpening();
    return router.parseUrl(docPath(id));
  } catch {
    return router.createUrlTree(['/docs']);
  }
}

/** The library, the editor and the reader. Spread into the app routes, so order matters there. */
export const documentsRoutes: Routes = [
  // All docs list page
  {
    path: 'docs',
    loadComponent: () => import('./pages/docs/docs').then((m) => m.Docs),
  },
  // A single doc/editor page
  {
    path: 'doc/:id',
    loadComponent: () => import('./pages/editor/editor').then((m) => m.EditorView),
    // Save debounced edits before the editor is destroyed: once destruction
    // starts, the editor can no longer emit them.
    canDeactivate: [(page: EditorView) => (page.flushPendingEdits(), true)],
  },
  // A new document: the installed app's "New document" shortcut (manifest.webmanifest)
  {
    path: 'new',
    canActivate: [openNewDocument],
    children: [],
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
    loadComponent: () => import('./pages/reader/reader').then((m) => m.Reader),
    data: STANDALONE_PAGE,
  },
  {
    path: 's/:hash',
    loadComponent: () => import('./pages/reader/reader').then((m) => m.Reader),
    data: STANDALONE_PAGE,
  },
];
