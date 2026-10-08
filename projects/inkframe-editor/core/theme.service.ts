import { Injectable, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type AppTheme = 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<AppTheme>('dark');

  constructor() {
    // Check localStorage if in browser environment
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem('inkframe-theme') as AppTheme | null;
        if (saved === 'dark' || saved === 'light') {
          this.theme.set(saved);
        }
      } catch {
        // Fallback to default dark
      }
    }

    // Reactively apply theme to DOM attributes and classes
    effect(() => {
      const current = this.theme();
      this.applyTheme(current);
    });
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme: AppTheme): void {
    this.theme.set(theme);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem('inkframe-theme', theme);
      } catch {
        // Ignore storage exceptions
      }
    }
  }

  private applyTheme(theme: AppTheme): void {
    const root = this.document.documentElement;
    const body = this.document.body;
    if (root) {
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
      if (theme === 'light') {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
      } else {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
      }
    }
    if (body) {
      body.setAttribute('data-theme', theme);
      body.style.colorScheme = theme;
      if (theme === 'light') {
        body.classList.add('theme-light');
        body.classList.remove('theme-dark');
      } else {
        body.classList.add('theme-dark');
        body.classList.remove('theme-light');
      }
    }
  }
}
