import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Theme } from '@inkframe-ui/editor/core';

@Component({
  selector: 'ink-landing',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-landing-layout">
      <!-- Top Navigation -->
      <header class="ink-landing-header">
        <div class="ink-nav-brand">
          <mat-icon class="brand-icon">edit_note</mat-icon>
          <span class="brand-name">Inkframe</span>
        </div>
        <div class="ink-nav-actions">
          <button
            type="button"
            class="ink-icon-btn"
            [matTooltip]="theme.theme() === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'"
            (click)="theme.toggleTheme()"
          >
            <mat-icon>{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
          <a mat-flat-button color="primary" routerLink="/docs" class="ink-btn-launch">
            <span>Open Documents</span>
            <mat-icon>arrow_forward</mat-icon>
          </a>
        </div>
      </header>

      <!-- Hero Section -->
      <main class="ink-landing-hero">
        <div class="ink-hero-chip">
          <span class="chip-dot"></span>
          <span>Offline-first · Zero backend · Pure ownership</span>
        </div>
        <h1 class="ink-hero-title">
          Write beautifully.<br />
          <span class="gradient-text">Stay distraction-free.</span>
        </h1>
        <p class="ink-hero-subtitle">
          A signal-driven rich-text canvas powered by ProseMirror with instant preview,
          offline IndexedDB storage, and portable link sharing.
        </p>
        <div class="ink-hero-actions">
          <a mat-flat-button color="primary" routerLink="/docs" class="ink-cta-btn">
            <span>Start Writing</span>
            <mat-icon>edit</mat-icon>
          </a>
          <a mat-stroked-button routerLink="/doc/welcome" class="ink-cta-secondary">
            <span>Try Interactive Demo</span>
          </a>
        </div>
      </main>
    </div>
  `,
  styles: `
    .ink-landing-layout {
      min-height: 100dvh;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ink-landing-header {
      height: 64px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--ink-border, #e8e6e1);
      background: var(--ink-surface, #ffffff);
    }
    .ink-nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 1.15rem;
      letter-spacing: -0.01em;
      .brand-icon {
        color: var(--ink-accent, #7c3aed);
      }
    }
    .ink-nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .ink-icon-btn {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 8px;
      cursor: pointer;
      color: inherit;
      transition: all 0.15s ease;
      &:hover {
        background: var(--ink-surface-2, #f1f0ec);
      }
    }
    .ink-landing-hero {
      flex: 1;
      max-width: 820px;
      margin: 0 auto;
      padding: 80px 24px 60px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .ink-hero-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 500;
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      color: var(--ink-text-muted, #6b6b73);
      margin-bottom: 28px;
      .chip-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ink-accent, #7c3aed);
      }
    }
    .ink-hero-title {
      font-size: clamp(2.2rem, 5vw, 3.8rem);
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin: 0 0 20px;
      .gradient-text {
        background: linear-gradient(135deg, var(--ink-accent, #7c3aed) 0%, #3b82f6 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
    }
    .ink-hero-subtitle {
      font-size: 1.15rem;
      line-height: 1.6;
      max-width: 620px;
      color: var(--ink-text-muted, #6b6b73);
      margin: 0 0 36px;
    }
    .ink-hero-actions {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `,
})
export class Landing {
  protected readonly theme = inject(Theme);
}

// Backward compatibility alias for existing tests
export { Landing as LandingComponent };
