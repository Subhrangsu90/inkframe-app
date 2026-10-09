import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '@inkframe-ui/editor/core';

@Component({
  selector: 'ink-settings',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-settings-layout">
      <header class="ink-settings-header">
        <div class="header-left">
          <a routerLink="/docs" class="ink-back-btn" matTooltip="Back to Documents">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <span class="header-title">Settings</span>
        </div>
      </header>

      <main class="ink-settings-main">
        <div class="settings-card">
          <h3>Appearance</h3>
          <p class="section-desc">Customize theme and display styling.</p>
          <div class="setting-row">
            <div>
              <strong>Current Theme</strong>
              <div class="sub-text">Switch between Dark and Light mode.</div>
            </div>
            <button mat-stroked-button (click)="themeService.toggleTheme()">
              <mat-icon>{{ themeService.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
              <span>{{ themeService.theme() === 'dark' ? 'Switch to Light' : 'Switch to Dark' }}</span>
            </button>
          </div>
        </div>

        <div class="settings-card">
          <h3>Data & Storage</h3>
          <p class="section-desc">Manage local IndexedDB storage and backups.</p>
          <div class="setting-row">
            <div>
              <strong>Export Backup</strong>
              <div class="sub-text">Download all your local documents as a JSON archive.</div>
            </div>
            <button mat-stroked-button>
              <mat-icon>download</mat-icon>
              <span>Export All</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: `
    .ink-settings-layout {
      min-height: 100dvh;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ink-settings-header {
      height: 56px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--ink-border, #e8e6e1);
      background: var(--ink-surface, #ffffff);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      .ink-back-btn {
        display: inline-flex;
        align-items: center;
        color: var(--ink-text-muted, #6b6b73);
        text-decoration: none;
        &:hover { color: var(--ink-text, #1b1b1f); }
      }
      .header-title {
        font-weight: 600;
        font-size: 1.05rem;
      }
    }
    .ink-settings-main {
      flex: 1;
      max-width: 680px;
      width: 100%;
      margin: 0 auto;
      padding: 40px 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      box-sizing: border-box;
    }
    .settings-card {
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      h3 { margin: 0 0 4px; font-weight: 600; font-size: 1.05rem; }
      .section-desc { margin: 0 0 20px; font-size: 0.85rem; color: var(--ink-text-muted, #6b6b73); }
    }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--ink-border, #e8e6e1);
      strong { font-size: 0.92rem; }
      .sub-text { font-size: 0.8rem; color: var(--ink-text-muted, #6b6b73); }
    }
  `,
})
export class SettingsComponent {
  protected readonly themeService = inject(ThemeService);
}
