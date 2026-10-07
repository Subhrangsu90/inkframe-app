import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { EditorPageComponent } from './pages/editor/editor-page.component';

export const routes: Routes = [
  { path: '', component: LandingComponent, pathMatch: 'full' },
  { path: 'editor', component: EditorPageComponent },
  { path: '**', redirectTo: '' },
];
