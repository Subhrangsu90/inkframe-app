import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { documentsRoutes } from './documents.routes';
import { docPath } from './documents.paths';

@Component({ template: '' })
class EmptyPage {}

// The real document routes, with empty pages so that navigating loads no editor.
const routes: Routes = documentsRoutes.map((route) =>
  route.loadComponent
    ? { ...route, loadComponent: undefined, canDeactivate: [], component: EmptyPage }
    : route,
);

describe('docPath', () => {
  async function open(id: string) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(docPath(id));
    let route = router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route;
  }

  it('opens the editor route with the document id', async () => {
    const route = await open('doc_1760000000000_ab12c');
    expect(route.routeConfig?.path).toBe('doc/:id');
    expect(route.paramMap.get('id')).toBe('doc_1760000000000_ab12c');
  });

  it('keeps an id with URL characters intact', async () => {
    const route = await open('a b/c?d#e');
    expect(route.routeConfig?.path).toBe('doc/:id');
    expect(route.paramMap.get('id')).toBe('a b/c?d#e');
  });
});
