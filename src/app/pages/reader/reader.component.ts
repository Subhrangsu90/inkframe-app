import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '@inkframe-ui/editor/core';

@Component({
  selector: 'ink-reader',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-reader-layout">
      <header class="ink-reader-header">
        <div class="header-left">
          <a routerLink="/" class="ink-brand-link">
            <mat-icon>edit_note</mat-icon>
            <span class="brand-title">Inkframe</span>
          </a>
          <span class="badge-read-only">Read-only Shared View</span>
        </div>
        <div class="header-right">
          <button
            type="button"
            class="ink-icon-btn"
            [matTooltip]="themeService.theme() === 'dark' ? 'Switch to Light' : 'Switch to Dark'"
            (click)="themeService.toggleTheme()"
          >
            <mat-icon>{{ themeService.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
          <a mat-flat-button color="primary" routerLink="/docs">
            <mat-icon>edit</mat-icon>
            <span>Open in My Editor</span>
          </a>
        </div>
      </header>

      <main class="ink-reader-viewport">
        <div class="ink-reader-page">
          <div class="ProseMirror ink-rendered-content" [innerHTML]="contentHtml()"></div>
        </div>
      </main>
    </div>
  `,
  styles: `
    .ink-reader-layout {
      min-height: 100dvh;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ink-reader-header {
      height: 56px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--ink-border, #e8e6e1);
      background: var(--ink-surface, #ffffff);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      .ink-brand-link {
        display: flex;
        align-items: center;
        gap: 8px;
        color: inherit;
        text-decoration: none;
        font-weight: 600;
        mat-icon { color: var(--ink-accent, #7c3aed); }
      }
      .badge-read-only {
        font-size: 0.75rem;
        padding: 3px 8px;
        background: var(--ink-surface-2, #f1f0ec);
        color: var(--ink-text-muted, #6b6b73);
        border-radius: 6px;
      }
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ink-icon-btn {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 8px;
      cursor: pointer;
      color: inherit;
      transition: all 0.15s ease;
      &:hover { background: var(--ink-surface-2, #f1f0ec); }
    }
    .ink-reader-viewport {
      flex: 1;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
      overflow-y: auto;
    }
    .ink-reader-page {
      width: 100%;
      max-width: 760px;
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 10px;
      padding: 48px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
      box-sizing: border-box;
    }
  `,
})
export class ReaderComponent implements OnInit {
  protected readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);

  protected readonly contentHtml = signal<string>('');

  ngOnInit(): void {
    this.contentHtml.set('<h2>Shared Document</h2><p>This is a shared read-only view of the document.</p>');
  }
}
