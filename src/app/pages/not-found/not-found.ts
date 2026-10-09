import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'ink-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-404-layout">
      <div class="ink-404-card">
        <mat-icon class="icon-404">find_in_page</mat-icon>
        <h1>404 - Page Not Found</h1>
        <p>The page or document you are looking for doesn't exist or was moved.</p>
        <div class="actions">
          <a mat-flat-button color="primary" routerLink="/docs">
            <mat-icon>folder</mat-icon>
            <span>My Documents</span>
          </a>
          <a mat-stroked-button routerLink="/">
            <span>Home</span>
          </a>
        </div>
      </div>
    </div>
  `,
  styles: `
    .ink-404-layout {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      padding: 24px;
      box-sizing: border-box;
    }
    .ink-404-card {
      max-width: 480px;
      width: 100%;
      text-align: center;
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 16px;
      padding: 48px 32px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      .icon-404 {
        font-size: 56px;
        width: 56px;
        height: 56px;
        color: var(--ink-accent, #7c3aed);
        margin-bottom: 16px;
      }
      h1 { margin: 0 0 12px; font-size: 1.5rem; font-weight: 700; }
      p { margin: 0 0 28px; color: var(--ink-text-muted, #6b6b73); font-size: 0.95rem; line-height: 1.5; }
      .actions { display: flex; gap: 12px; justify-content: center; }
    }
  `,
})
export class NotFound {}

// Backward compatibility alias
export { NotFound as NotFoundComponent };
