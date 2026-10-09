import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '@inkframe-ui/editor/core';
import { DocumentManagerService, DocMeta, formatRelativeTime } from '../../core/document-manager.service';

@Component({
  selector: 'ink-docs',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-docs-layout">
      <!-- Top Navigation -->
      <header class="ink-docs-header">
        <div class="ink-header-left">
          <a routerLink="/" class="ink-home-link" matTooltip="Back to Home">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <span class="ink-header-title">My Documents</span>
        </div>
        <div class="ink-header-right">
          <button
            type="button"
            class="ink-icon-btn"
            [matTooltip]="themeService.theme() === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'"
            (click)="themeService.toggleTheme()"
          >
            <mat-icon>{{ themeService.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
          <a routerLink="/settings" class="ink-icon-btn" matTooltip="Settings">
            <mat-icon>settings</mat-icon>
          </a>
          <button mat-flat-button color="primary" class="ink-btn-new" (click)="createNewDoc()">
            <mat-icon>add</mat-icon>
            <span>New Document</span>
          </button>
        </div>
      </header>

      <!-- Main Content -->
      <main class="ink-docs-main">
        <div class="ink-docs-toolbar">
          <div class="ink-search-wrapper">
            <mat-icon class="search-icon">search</mat-icon>
            <input
              type="text"
              placeholder="Search documents..."
              class="ink-search-input"
              [value]="searchQuery()"
              (input)="onSearchInput($event)"
            />
          </div>
          <span class="ink-doc-count">{{ filteredDocs().length }} documents</span>
        </div>

        @if (filteredDocs().length === 0) {
          <div class="ink-empty-state">
            <mat-icon class="empty-icon">note_add</mat-icon>
            <h3>No documents found</h3>
            <p>Create your first document or refine your search query.</p>
            <button mat-flat-button color="primary" (click)="createNewDoc()">
              <mat-icon>add</mat-icon>
              <span>Create New Document</span>
            </button>
          </div>
        } @else {
          <div class="ink-docs-grid">
            @for (doc of filteredDocs(); track doc.id) {
              <div class="ink-doc-card" (click)="openDoc(doc.id)">
                <div class="card-icon">
                  <mat-icon>description</mat-icon>
                </div>
                <div class="card-body">
                  <h4 class="card-title">{{ doc.title || 'Untitled Document' }}</h4>
                  <div class="card-meta">
                    <span>{{ formatTime(doc.updatedAt) }}</span>
                    <span>·</span>
                    <span>{{ doc.wordCount }} words</span>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </main>
    </div>
  `,
  styles: `
    .ink-docs-layout {
      min-height: 100dvh;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ink-docs-header {
      height: 56px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--ink-border, #e8e6e1);
      background: var(--ink-surface, #ffffff);
    }
    .ink-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      .ink-home-link {
        display: flex;
        align-items: center;
        color: var(--ink-text-muted, #6b6b73);
        text-decoration: none;
        &:hover { color: var(--ink-text, #1b1b1f); }
      }
      .ink-header-title {
        font-weight: 600;
        font-size: 1.05rem;
      }
    }
    .ink-header-right {
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
      text-decoration: none;
      transition: all 0.15s ease;
      &:hover { background: var(--ink-surface-2, #f1f0ec); }
    }
    .ink-docs-main {
      flex: 1;
      max-width: 1080px;
      width: 100%;
      margin: 0 auto;
      padding: 32px 24px;
      box-sizing: border-box;
    }
    .ink-docs-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 16px;
    }
    .ink-search-wrapper {
      position: relative;
      flex: 1;
      max-width: 380px;
      .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ink-text-muted, #6b6b73);
      }
      .ink-search-input {
        width: 100%;
        height: 38px;
        padding: 0 12px 0 38px;
        border: 1px solid var(--ink-border, #e8e6e1);
        border-radius: 8px;
        background: var(--ink-surface, #ffffff);
        color: inherit;
        outline: none;
        box-sizing: border-box;
        &:focus { border-color: var(--ink-accent, #7c3aed); }
      }
    }
    .ink-doc-count {
      font-size: 0.85rem;
      color: var(--ink-text-muted, #6b6b73);
    }
    .ink-docs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .ink-doc-card {
      background: var(--ink-surface, #ffffff);
      border: 1px solid var(--ink-border, #e8e6e1);
      border-radius: 12px;
      padding: 18px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      transition: all 0.15s ease;
      &:hover {
        border-color: var(--ink-border-strong, #d6d3cc);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
      }
      .card-icon {
        color: var(--ink-accent, #7c3aed);
      }
      .card-body {
        flex: 1;
        min-width: 0;
      }
      .card-title {
        margin: 0 0 6px;
        font-size: 0.95rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .card-meta {
        font-size: 0.8rem;
        color: var(--ink-text-muted, #6b6b73);
        display: flex;
        gap: 6px;
      }
    }
    .ink-empty-state {
      padding: 60px 20px;
      text-align: center;
      background: var(--ink-surface, #ffffff);
      border: 1px dashed var(--ink-border, #e8e6e1);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      .empty-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--ink-text-muted, #6b6b73);
        margin-bottom: 16px;
      }
      h3 { margin: 0 0 8px; font-weight: 600; }
      p { margin: 0 0 20px; color: var(--ink-text-muted, #6b6b73); font-size: 0.95rem; }
    }
  `,
})
export class DocsComponent implements OnInit {
  protected readonly themeService = inject(ThemeService);
  private readonly docService = inject(DocumentManagerService);
  private readonly router = inject(Router);

  protected readonly docs = signal<DocMeta[]>([]);
  protected readonly searchQuery = signal('');

  async ngOnInit(): Promise<void> {
    const list = await this.docService.getIndex();
    this.docs.set(list);
  }

  protected filteredDocs(): DocMeta[] {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.docs();
    return this.docs().filter((d) => (d.title || '').toLowerCase().includes(q));
  }

  protected onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
  }

  protected formatTime(timestamp: number): string {
    return formatRelativeTime(timestamp);
  }

  protected openDoc(id: string): void {
    this.router.navigate(['/doc', id]);
  }

  protected async createNewDoc(): Promise<void> {
    const res = await this.docService.createDoc('Untitled Document');
    this.router.navigate(['/doc', res.meta.id]);
  }
}
