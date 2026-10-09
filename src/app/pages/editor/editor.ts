import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Editor as InkEditor } from '@inkframe-ui/editor';
import {
  StoredDoc,
  Theme,
  docToHtml,
  docToMarkdown,
} from '@inkframe-ui/editor/core';
import {
  DocumentManager,
  extractDocTitle,
  extractDocWordCount,
} from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';

@Component({
  selector: 'ink-editor-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    InkEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-editor-page-layout">
      <!-- Minimalist Single-Row 56px Top Bar -->
      <header class="ink-top-bar">
        <div class="top-bar-left">
          <a routerLink="/docs" class="ink-back-btn" matTooltip="Back to Documents">
            <mat-icon>arrow_back</mat-icon>
          </a>
          <div class="title-container">
            <input
              type="text"
              class="doc-title-input"
              [value]="docTitle()"
              (change)="onTitleChange($event)"
              placeholder="Untitled Document"
            />
          </div>
        </div>

        <div class="top-bar-center">
          <div class="ink-view-switcher" role="tablist">
            <button
              type="button"
              class="switcher-btn"
              [class.active]="activeTab() === 'edit'"
              (click)="activeTab.set('edit')"
            >
              <mat-icon>edit</mat-icon>
              <span>Editor</span>
            </button>
            <button
              type="button"
              class="switcher-btn"
              [class.active]="activeTab() === 'preview'"
              (click)="activeTab.set('preview')"
            >
              <mat-icon>visibility</mat-icon>
              <span>Preview</span>
            </button>
          </div>
        </div>

        <div class="top-bar-right">
          <!-- Quiet autosave indicator -->
          <div class="ink-save-status">
            @if (saving()) {
              <span class="status-saving">Saving...</span>
            } @else {
              <span class="status-saved">Saved ✓</span>
            }
          </div>

          <!-- Theme toggle -->
          <button
            type="button"
            class="ink-icon-btn"
            [matTooltip]="theme.theme() === 'dark' ? 'Switch to Light' : 'Switch to Dark'"
            (click)="theme.toggleTheme()"
          >
            <mat-icon>{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>

          <!-- Share button -->
          <button mat-flat-button color="primary" class="ink-btn-share" (click)="shareDoc()">
            <mat-icon>share</mat-icon>
            <span>Share</span>
          </button>

          <!-- More menu -->
          <button type="button" class="ink-icon-btn" [matMenuTriggerFor]="moreMenu" matTooltip="More options">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #moreMenu="matMenu">
            <button mat-menu-item (click)="exportMarkdown()">
              <mat-icon>download</mat-icon>
              <span>Export Markdown</span>
            </button>
            <button mat-menu-item (click)="exportHtml()">
              <mat-icon>code</mat-icon>
              <span>Export HTML</span>
            </button>
            <button mat-menu-item (click)="exportJson()">
              <mat-icon>data_object</mat-icon>
              <span>Export JSON</span>
            </button>
          </mat-menu>
        </div>
      </header>

      <!-- Main Canvas Viewport -->
      <main class="ink-main-viewport">
        @if (activeTab() === 'edit') {
          <ink-editor
            #editor
            [initialDoc]="currentDoc()"
            (changed)="onContentChanged($event)"
          />
        } @else {
          <div class="ink-preview-wrapper">
            <div class="ink-doc-page">
              <div class="ProseMirror ink-preview-rendered" [innerHTML]="renderedHtml()"></div>
            </div>
          </div>
        }
      </main>

      <!-- 28px Footer Status Bar -->
      <footer class="ink-status-bar">
        <div class="status-left">
          <span>Words: {{ wordCount() }}</span>
          <span>·</span>
          <span>Reading time: ~{{ readingTime() }} min</span>
        </div>
        <div class="status-right">
          <span>Markdown Supported</span>
        </div>
      </footer>
    </div>
  `,
  styles: `
    .ink-editor-page-layout {
      height: 100dvh;
      display: flex;
      flex-direction: column;
      background: var(--ink-bg, #f7f6f3);
      color: var(--ink-text, #1b1b1f);
      box-sizing: border-box;
      overflow: hidden;
    }
    .ink-top-bar {
      height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--ink-surface, #ffffff);
      border-bottom: 1px solid var(--ink-border, #e8e6e1);
      z-index: 10;
    }
    .top-bar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      max-width: 320px;
      .ink-back-btn {
        display: inline-flex;
        align-items: center;
        color: var(--ink-text-muted, #6b6b73);
        text-decoration: none;
        &:hover { color: var(--ink-text, #1b1b1f); }
      }
      .title-container {
        flex: 1;
        .doc-title-input {
          width: 100%;
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 0.95rem;
          font-weight: 600;
          color: inherit;
          background: transparent;
          outline: none;
          &:hover { border-color: var(--ink-border, #e8e6e1); }
          &:focus {
            background: var(--ink-surface-2, #f1f0ec);
            border-color: var(--ink-accent, #7c3aed);
          }
        }
      }
    }
    .top-bar-center {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ink-view-switcher {
      display: inline-flex;
      background: var(--ink-surface-2, #f1f0ec);
      padding: 3px;
      border-radius: 8px;
      gap: 2px;
      .switcher-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border: none;
        background: transparent;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 500;
        color: var(--ink-text-muted, #6b6b73);
        cursor: pointer;
        transition: all 0.15s ease;
        mat-icon { font-size: 16px; width: 16px; height: 16px; }
        &.active {
          background: var(--ink-surface, #ffffff);
          color: var(--ink-accent, #7c3aed);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
      }
    }
    .top-bar-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ink-save-status {
      font-size: 0.8rem;
      margin-right: 4px;
      .status-saving { color: var(--ink-text-muted, #6b6b73); }
      .status-saved { color: var(--ink-success, #16a34a); }
    }
    .ink-icon-btn {
      width: 32px;
      height: 32px;
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
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }
    .ink-btn-share {
      height: 32px;
      font-size: 0.85rem;
      mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; }
    }
    .ink-main-viewport {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .ink-preview-wrapper {
      flex: 1;
      overflow-y: auto;
      padding: 24px 16px;
      display: flex;
      justify-content: center;
      .ink-doc-page {
        width: 100%;
        max-width: 760px;
        background: var(--ink-surface, #ffffff);
        border: 1px solid var(--ink-border, #e8e6e1);
        border-radius: 8px;
        padding: 40px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
        box-sizing: border-box;
      }
    }
    .ink-status-bar {
      height: 28px;
      padding: 0 16px;
      background: var(--ink-surface, #ffffff);
      border-top: 1px solid var(--ink-border, #e8e6e1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--ink-text-muted, #6b6b73);
      .status-left {
        display: flex;
        gap: 8px;
      }
    }
  `,
})
export class EditorView implements OnInit {
  protected readonly theme = inject(Theme);
  private readonly docService = inject(DocumentManager);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly editorRef = viewChild<InkEditor>('editor');

  protected readonly currentDocId = signal<string>('welcome');
  protected readonly docTitle = signal<string>('Welcome to Inkframe');
  protected readonly currentDoc = signal<StoredDoc>(WELCOME_DOC);
  protected readonly activeTab = signal<'edit' | 'preview'>('edit');
  protected readonly saving = signal(false);

  protected readonly wordCount = computed(() => {
    return extractDocWordCount(this.currentDoc());
  });

  protected readonly readingTime = computed(() => {
    const words = this.wordCount();
    return Math.max(1, Math.ceil(words / 200));
  });

  protected readonly renderedHtml = computed(() => {
    const ed = this.editorRef();
    if (ed) return ed.getHtml();
    return '';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') || 'welcome';
    this.currentDocId.set(id);
    if (id === 'welcome') {
      this.currentDoc.set(WELCOME_DOC);
      this.docTitle.set('Welcome to Inkframe');
    } else {
      const stored = await this.docService.getDoc(id);
      if (stored) {
        this.currentDoc.set(stored);
        this.docTitle.set(extractDocTitle(stored));
      }
    }
  }

  protected async onTitleChange(event: Event): Promise<void> {
    const title = (event.target as HTMLInputElement).value;
    this.docTitle.set(title);
    await this.docService.saveDoc(this.currentDocId(), this.currentDoc(), title);
  }

  protected async onContentChanged(doc: StoredDoc): Promise<void> {
    this.currentDoc.set(doc);
    this.saving.set(true);
    await this.docService.saveDoc(this.currentDocId(), doc);
    this.saving.set(false);
  }

  protected shareDoc(): void {
    const id = this.currentDocId();
    navigator.clipboard?.writeText(window.location.origin + '/doc/' + id);
    alert('Document link copied to clipboard!');
  }

  protected exportMarkdown(): void {
    const md = this.editorRef()?.getMarkdown() || '';
    this.downloadFile(`${this.docTitle()}.md`, md, 'text/markdown');
  }

  protected exportHtml(): void {
    const html = this.editorRef()?.getHtml() || '';
    this.downloadFile(`${this.docTitle()}.html`, html, 'text/html');
  }

  protected exportJson(): void {
    const json = JSON.stringify(this.currentDoc(), null, 2);
    this.downloadFile(`${this.docTitle()}.json`, json, 'application/json');
  }

  private downloadFile(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Backward compatibility aliases
export { EditorView as EditorPageComponent };
