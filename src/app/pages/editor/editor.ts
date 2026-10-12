import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Editor } from '@inkframe-ui/editor';
import {
  DEFAULT_EXTENSIONS,
  HistoryExtension,
  HeadingExtension,
  BoldExtension,
  ItalicExtension,
  BulletListExtension,
  TableExtension,
  CalloutExtension,
  CodeBlockExtension,
  EditorExtension,
  createExtension,
  StoredDoc,
  SCHEMA_VERSION,
  docToMarkdown,
  schema,
} from '@inkframe-ui/editor/core';
import { LayoutService } from '../../shared/layout/layout.service';
import { DocumentManager, extractDocTitle } from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';
import { InkIcon } from '../../shared/ui/icons/icon';
import { ToastService } from '../../shared/ui';
import { buildShareableUrl } from '../../core/share-codec';

// Custom plugin demo
const CustomPluginDemo: EditorExtension = createExtension({
  name: 'custom_star_tool',
  toolbarItems: [
    {
      id: 'custom_star',
      glyph: '★ Custom Plugin',
      tooltip: 'Custom Plugin Tool: Insert starred snippet',
      run: (svc) => {
        svc.insertText(' ★ [Custom Plugin Tool Activated] ★ ');
      },
    },
  ],
  slashItems: [
    {
      id: 'star_action',
      label: 'Custom Plugin Action',
      hint: 'Inserted via your custom plugin',
      icon: 'stars',
      keywords: ['custom', 'plugin', 'star'],
      run: (svc) => {
        svc.insertText('✨ This block was created by your custom plugin slash command! ✨\n');
      },
    },
  ],
});

export type PluginPreset = 'starter-kit' | 'minimal' | 'custom' | 'zen';
export type EditorViewTab = 'rich' | 'preview';

@Component({
  selector: 'ink-editor-page',
  standalone: true,
  imports: [CommonModule, FormsModule, Editor, InkIcon],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorView implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly docManager = inject(DocumentManager);
  private readonly layout = inject(LayoutService);
  private readonly toast = inject(ToastService);

  readonly editorRef = viewChild<Editor>('editorComp');

  // Header template refs for dynamic app-shell header
  readonly headerLeftTpl = viewChild<TemplateRef<any>>('headerLeft');
  readonly headerCenterTpl = viewChild<TemplateRef<any>>('headerCenter');
  readonly headerRightTpl = viewChild<TemplateRef<any>>('headerRight');

  constructor() {
    effect(() => {
      const left = this.headerLeftTpl();
      const center = this.headerCenterTpl();
      const right = this.headerRightTpl();
      this.layout.setHeaderTemplates({
        left: left ?? null,
        center: center ?? null,
        right: right ?? null,
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.layout.clearHeaderTemplates();
    });
  }

  // Active View Tab: Rich Canvas or Preview
  readonly activeView = signal<EditorViewTab>('rich');

  // Document identity & content
  readonly currentDocId = signal<string>('doc_default');
  readonly docTitle = signal<string>('Welcome to Inkframe');
  readonly currentStoredDoc = signal<StoredDoc | null>(null);
  readonly saveStatus = signal<'saved' | 'saving'>('saved');

  // Plugin preset system
  readonly activePreset = signal<PluginPreset>('starter-kit');
  readonly showToolbar = computed(() => this.activePreset() !== 'zen');
  readonly showPresetMenu = signal<boolean>(false);
  readonly showShareMenu = signal<boolean>(false);
  readonly shareUrl = signal<string>('');
  readonly isEditingTitle = signal<boolean>(false);

  readonly extensions = computed<EditorExtension[]>(() => {
    switch (this.activePreset()) {
      case 'minimal':
        return [
          HistoryExtension,
          HeadingExtension,
          BoldExtension,
          ItalicExtension,
          BulletListExtension,
          CodeBlockExtension,
        ];
      case 'custom':
        return [
          HistoryExtension,
          HeadingExtension,
          BoldExtension,
          ItalicExtension,
          BulletListExtension,
          TableExtension,
          CustomPluginDemo,
        ];
      case 'zen':
        return DEFAULT_EXTENSIONS;
      case 'starter-kit':
      default:
        return DEFAULT_EXTENSIONS;
    }
  });

  /** Incremented per navigation so a slow load cannot override a newer one. */
  private loadToken = 0;

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      const idParam = params.get('id');
      const docId = idParam || this.docManager.getActiveDocId() || 'doc_default';
      this.layout.setActiveDocId(docId);
      await this.loadDocument(docId);
    });
  }

  async loadDocument(id: string): Promise<void> {
    const token = ++this.loadToken;
    try {
      let docId = id;
      let doc = await this.docManager.getDoc(id);
      if (token !== this.loadToken) return;
      if (!doc) {
        // If not found, fall back to welcome doc or create one
        if (id === 'doc_default') {
          doc = WELCOME_DOC;
          await this.docManager.saveDoc(id, doc, 'Welcome to Inkframe ✦');
        } else {
          const created = await this.docManager.createDoc('Untitled Document');
          doc = created.doc;
          docId = created.meta.id;
        }
        if (token !== this.loadToken) return;
      }

      // Load into the editor *before* switching ids: loadDoc() first emits any
      // pending edits of the previous document, which must be saved under the
      // previous id. If the document cannot be parsed this throws and the ids
      // stay untouched, so edits are never saved into the wrong document.
      this.editorRef()?.loadDoc(doc);

      this.currentDocId.set(docId);
      this.layout.setActiveDocId(docId);
      this.currentStoredDoc.set(doc);
      this.docTitle.set(extractDocTitle(doc));
    } catch (e) {
      if (token !== this.loadToken) return;
      console.warn('Failed to load document:', e);
      this.toast.error('This document could not be opened');
      await this.router.navigate(['/docs']);
    }
  }

  /** Emits any debounced edits now so they are saved (called before leaving the page). */
  flushPendingEdits(): void {
    this.editorRef()?.flush();
  }

  // ── Tab Switching (Rich Canvas / Preview) ────────────────────────
  setActiveView(tab: EditorViewTab): void {
    this.activeView.set(tab);
  }

  // ── Document Editing & Autosave ──────────────────────────────────
  async onDocChanged(doc: StoredDoc): Promise<void> {
    this.saveStatus.set('saving');
    this.currentStoredDoc.set(doc);

    const title = extractDocTitle(doc);
    if (title && title !== 'Untitled Document') {
      this.docTitle.set(title);
    }

    const id = this.currentDocId();
    await this.docManager.saveDoc(id, doc, this.docTitle());
    await this.layout.refreshDocs();

    setTimeout(() => {
      this.saveStatus.set('saved');
    }, 250);
  }

  async onTitleChange(newTitle: string): Promise<void> {
    const trimmed = newTitle.trim() || 'Untitled Document';
    this.docTitle.set(trimmed);
    this.isEditingTitle.set(false);

    const doc = this.currentStoredDoc() || WELCOME_DOC;
    await this.docManager.saveDoc(this.currentDocId(), doc, trimmed);
    await this.layout.refreshDocs();
    this.toast.success('Document title updated');
  }

  // ── Preset Selection ─────────────────────────────────────────────
  setPreset(preset: PluginPreset): void {
    this.activePreset.set(preset);
    this.showPresetMenu.set(false);
  }

  togglePresetMenu(): void {
    this.showPresetMenu.set(!this.showPresetMenu());
  }

  // ── Export Actions ───────────────────────────────────────────────
  exportMarkdown(): void {
    const editor = this.editorRef();
    let md = editor?.getMarkdown();
    if (!md) {
      const stored = this.currentStoredDoc();
      if (stored?.doc) {
        try {
          const pmNode = schema.nodeFromJSON(stored.doc);
          md = docToMarkdown(pmNode);
        } catch {}
      }
    }
    const finalMd = md || '# ' + this.docTitle();
    const filename = `${
      this.docTitle()
        .replace(/[^\w\s-]/g, '')
        .trim() || 'document'
    }.md`;

    const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Downloaded ' + filename);
  }

  copyMarkdown(): void {
    const editor = this.editorRef();
    let md = editor?.getMarkdown();
    if (!md) {
      const stored = this.currentStoredDoc();
      if (stored?.doc) {
        try {
          const pmNode = schema.nodeFromJSON(stored.doc);
          md = docToMarkdown(pmNode);
        } catch {}
      }
    }
    const finalMd = md || '# ' + this.docTitle();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(finalMd);
      this.toast.success('Markdown copied to clipboard!');
    }
  }

  // ── Share Reader Link Actions ────────────────────────────────────
  async toggleShareMenu(): Promise<void> {
    const next = !this.showShareMenu();
    this.showShareMenu.set(next);
    if (next) {
      await this.updateShareUrl();
    }
  }

  async updateShareUrl(): Promise<void> {
    const doc = this.currentStoredDoc();
    if (doc) {
      const url = await buildShareableUrl(doc, this.docTitle());
      this.shareUrl.set(url);
    }
  }

  async copyReaderLink(): Promise<void> {
    if (!this.shareUrl()) {
      await this.updateShareUrl();
    }
    const url = this.shareUrl();
    if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      this.toast.success('Shareable link copied to clipboard!');
      this.showShareMenu.set(false);
    }
  }
}
