import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'docs',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'settings',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'editor',
    renderMode: RenderMode.Client,
  },
  {
    path: 'doc/:id',
    renderMode: RenderMode.Client,
  },
  {
    path: 's',
    renderMode: RenderMode.Client,
  },
  {
    path: 's/:hash',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
