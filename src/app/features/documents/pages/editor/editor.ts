import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Editor } from '@inkframe-ui/editor';
import {
  DEFAULT_EXTENSIONS,
  HistoryExtension,
  HeadingExtension,
  BoldExtension,
  ItalicExtension,
  BulletListExtension,
  TableExtension,
  CodeBlockExtension,
  EditorExtension,
  createExtension,
  StoredDoc,
  StorageError,
  docToHtml,
  imageStorage,
  migrate,
  sanitizeHtml,
  schema,
} from '@inkframe-ui/editor/core';
import { LayoutService } from '@app/layout/layout.service';
import {
  DocumentManager,
  extractDocTitle,
} from '@app/features/documents/data-access/document-manager';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { WELCOME_DOC } from '@app/features/documents/data-access/welcome-doc';
import { InkIcon } from '@app/shared/ui/icons/icon';
import { ConfirmDialogService, ToastService } from '@app/shared/ui';
import { buildShareableUrl } from '@app/features/documents/transfer/share-codec';
import {
  docToMarkdownText,
  downloadHtml,
  downloadMarkdown,
  printDocument,
} from '@app/features/documents/transfer/doc-export';
import { VersionHistory, VersionMeta } from '@app/features/documents/versions/version-history';
import { StorageHealth } from '@app/features/documents/data-access/storage-health';
import { VersionPanel } from './version-panel/version-panel';
import { PwaService } from '@app/core/pwa';
import { PageMetaStrategy } from '@app/core/page-meta';

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
  imports: [
    CommonModule,
    FormsModule,
    MatMenuModule,
    MatDividerModule,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    Editor,
    InkIcon,
    VersionPanel,
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'showShareMenu.set(false)',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class EditorView implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly docManager = inject(DocumentManager);
  private readonly layout = inject(LayoutService);
  private readonly library = inject(DocumentLibrary);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly versionHistory = inject(VersionHistory);
  private readonly storageHealth = inject(StorageHealth);
  private readonly sanitizer = inject(DomSanitizer);

  readonly editorRef = viewChild<Editor>('editorComp');

  // Header template refs for dynamic app-shell header
  readonly headerLeftTpl = viewChild<TemplateRef<unknown>>('headerLeft');
  readonly headerCenterTpl = viewChild<TemplateRef<unknown>>('headerCenter');
  readonly headerRightTpl = viewChild<TemplateRef<unknown>>('headerRight');
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    // The tab shows the document's title, as the header does, and follows renames.
    const pageMeta = inject(PageMetaStrategy);
    effect(() => pageMeta.setPageTitle(this.docTitle()));

    // Focus the title field when renaming starts. (The `autofocus` attribute
    // only works for the first element a page focuses, so not for later renames.)
    afterRenderEffect(() => {
      const input = this.titleInput()?.nativeElement;
      if (input && this.isEditingTitle()) {
        input.focus();
        input.select();
      }
    });

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

    // Reloading for an app update waits until every edit is saved.
    const removeBeforeReload = inject(PwaService).beforeReload(() => this.settle());

    inject(DestroyRef).onDestroy(() => {
      this.layout.clearHeaderTemplates();
      removeBeforeReload();
    });
  }

  // Active View Tab: Rich Canvas or Preview
  readonly activeView = signal<EditorViewTab>('rich');

  // Document identity & content
  readonly currentDocId = signal<string>('doc_default');
  readonly docTitle = signal<string>('Welcome to Inkframe');
  readonly currentStoredDoc = signal<StoredDoc | null>(null);
  /** `error`: storage refused the latest edits (see the storage banner). */
  readonly saveStatus = signal<'saved' | 'saving' | 'error'>('saved');
  /** An export or print being prepared. */
  readonly exporting = signal(false);

  // Version history
  readonly historyOpen = signal(false);
  readonly versions = signal<VersionMeta[]>([]);
  readonly previewVersion = signal<VersionMeta | null>(null);
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly historyBusy = signal(false);
  /** When the previewed version was saved. (Not the date pipe: it adds 12 kB to every page.) */
  readonly previewWhen = computed(() => {
    const version = this.previewVersion();
    return version
      ? new Date(version.createdAt).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '';
  });
  private previewToken = 0;

  /** Saves run one after another, in the order edits were made. */
  private saveChain: Promise<void> = Promise.resolve();
  private pendingSaves = 0;

  // Plugin preset system
  readonly activePreset = signal<PluginPreset>('starter-kit');
  readonly showToolbar = computed(() => this.activePreset() !== 'zen');
  readonly showPresetMenu = signal<boolean>(false);
  readonly showShareMenu = signal<boolean>(false);
  /** The share popover opens below its button, aligned to its right edge (or left, without room). */
  readonly sharePositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ];
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
      this.library.setActiveDocId(docId);
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

      if (docId !== this.currentDocId()) this.closeHistory();
      this.currentDocId.set(docId);
      this.library.setActiveDocId(docId);
      this.currentStoredDoc.set(doc);
      this.docTitle.set(extractDocTitle(doc));
      this.saveStatus.set('saved');
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
  onDocChanged(doc: StoredDoc): Promise<boolean> {
    // Read before anything is awaited: on a document switch the editor emits
    // the previous document's last edits, and the ids change right after.
    const id = this.currentDocId();
    const previous = this.currentStoredDoc();
    this.currentStoredDoc.set(doc);

    const title = extractDocTitle(doc);
    if (title && title !== 'Untitled Document') {
      this.docTitle.set(title);
    }
    return this.queueSave(id, doc, this.docTitle(), previous);
  }

  async onTitleChange(newTitle: string): Promise<void> {
    const trimmed = newTitle.trim() || 'Untitled Document';
    this.docTitle.set(trimmed);
    this.isEditingTitle.set(false);

    const doc = this.currentStoredDoc() || WELCOME_DOC;
    if (await this.queueSave(this.currentDocId(), doc, trimmed)) {
      this.toast.success('Document title updated');
    }
  }

  /**
   * Saves after any earlier save has finished. When storage refuses the
   * edits the status shows "Not saved" and the storage banner offers a
   * backup, which includes them. With `previous`, records the edit in the
   * version history. Resolves to whether the save succeeded.
   */
  private queueSave(
    id: string,
    doc: StoredDoc,
    title: string,
    previous?: StoredDoc | null,
  ): Promise<boolean> {
    this.pendingSaves++;
    this.saveStatus.set('saving');
    const task = this.saveChain.then(async () => {
      let saved = true;
      try {
        await this.docManager.saveDoc(id, doc, title);
        this.storageHealth.markSaved(id);
      } catch (e) {
        saved = false;
        console.warn('Failed to save document:', e);
        this.storageHealth.markUnsaved(id, title, doc);
      }
      this.pendingSaves--;
      if (id === this.currentDocId()) {
        if (!saved) this.saveStatus.set('error');
        else if (this.pendingSaves === 0 && this.saveStatus() !== 'error') {
          this.saveStatus.set('saved');
        }
      }
      if (saved) {
        await this.library.refreshDocs();
        if (previous !== undefined) {
          await this.versionHistory
            .recordEdit(id, previous, doc)
            .catch((e) => console.warn('Failed to save a version:', e));
        }
      }
      return saved;
    });
    this.saveChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  /** The document as it is in the editor now, including edits not saved yet. */
  private liveDoc(): StoredDoc {
    return this.editorRef()?.getJSON() ?? this.currentStoredDoc() ?? WELCOME_DOC;
  }

  /** Saves pending edits and waits until every save has finished. */
  private async settle(): Promise<void> {
    this.flushPendingEdits();
    await this.saveChain;
  }

  protected onDocumentKeydown(event: KeyboardEvent): void {
    // Ctrl/Cmd+P prints the document itself, not the app around it.
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      void this.printDoc();
    }
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
    try {
      this.toast.success('Downloaded ' + downloadMarkdown(this.liveDoc(), this.docTitle()));
    } catch (e) {
      console.warn('Markdown export failed:', e);
      this.toast.error('The document could not be exported');
    }
  }

  async exportHtml(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      this.toast.success('Downloaded ' + (await downloadHtml(this.liveDoc(), this.docTitle())));
    } catch (e) {
      console.warn('HTML export failed:', e);
      this.toast.error('The document could not be exported');
    } finally {
      this.exporting.set(false);
    }
  }

  /** Opens the print dialog with the document alone; "Save as PDF" there makes a PDF. */
  async printDoc(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await printDocument(this.liveDoc(), this.docTitle());
    } catch (e) {
      console.warn('Print failed:', e);
      this.toast.error('The document could not be printed');
    } finally {
      this.exporting.set(false);
    }
  }

  async copyMarkdown(): Promise<void> {
    try {
      const markdown = docToMarkdownText(this.liveDoc()) || '# ' + this.docTitle();
      await navigator.clipboard.writeText(markdown);
      this.toast.success('Markdown copied to clipboard');
    } catch {
      this.toast.error('The Markdown could not be copied');
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

  // ── Version History ──────────────────────────────────────────────
  /** The toolbar's history button toggles the panel. */
  async toggleHistory(): Promise<void> {
    if (this.historyOpen()) {
      this.closeHistory();
      return;
    }
    // So the list includes the latest edits' automatic version.
    await this.settle();
    this.historyOpen.set(true);
    await this.loadVersions();
  }

  closeHistory(): void {
    this.exitPreview();
    this.historyOpen.set(false);
  }

  private async loadVersions(): Promise<void> {
    const id = this.currentDocId();
    const list = await this.versionHistory.list(id);
    if (id === this.currentDocId()) this.versions.set(list);
  }

  /** Shows a version in place of the editor; null returns to the current text. */
  async selectVersion(meta: VersionMeta | null): Promise<void> {
    if (!meta) {
      this.exitPreview();
      return;
    }
    const token = ++this.previewToken;
    try {
      const stored = await this.versionHistory.get(meta.id);
      if (!stored) throw new Error(`Version ${meta.id} is missing`);
      const html = await imageStorage.resolveHtmlImages(
        docToHtml(schema.nodeFromJSON(migrate(stored))),
      );
      if (token !== this.previewToken) return;
      // The content is the person's own document; it is sanitized all the
      // same, as the reader does, because Angular's sanitizer would strip the
      // editor's inline styles.
      this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(sanitizeHtml(html)));
      this.previewVersion.set(meta);
    } catch (e) {
      if (token !== this.previewToken) return;
      console.warn('Failed to open version:', e);
      this.toast.error('This version could not be opened');
    }
  }

  exitPreview(): void {
    this.previewToken++;
    this.previewVersion.set(null);
    this.previewHtml.set(null);
  }

  /**
   * Makes the previewed version the current text. The text it replaces is
   * saved as a version first, so restoring can itself be undone.
   */
  async restorePreviewedVersion(): Promise<void> {
    const meta = this.previewVersion();
    if (!meta || this.historyBusy()) return;
    this.historyBusy.set(true);
    try {
      const target = await this.versionHistory.get(meta.id);
      if (!target) throw new Error(`Version ${meta.id} is missing`);
      await this.settle();
      const id = this.currentDocId();
      await this.versionHistory.snapshot(id, this.liveDoc(), 'before-restore');

      this.editorRef()?.loadDoc(target);
      this.currentStoredDoc.set(target);
      const title = extractDocTitle(target);
      if (title !== 'Untitled Document') this.docTitle.set(title);
      if (!(await this.queueSave(id, target, this.docTitle()))) {
        throw new StorageError('quota');
      }

      this.exitPreview();
      await this.loadVersions();
      this.toast.success('Version restored. The text it replaced is in the version history.', 5000);
    } catch (e) {
      console.warn('Failed to restore version:', e);
      this.toast.error(
        e instanceof StorageError
          ? 'Storage is full, so the version could not be restored.'
          : 'This version could not be restored',
      );
    } finally {
      this.historyBusy.set(false);
    }
  }

  /** Saves the current text as a named version, which is kept until deleted. */
  async saveNamedVersion(name: string): Promise<void> {
    if (this.historyBusy()) return;
    this.historyBusy.set(true);
    try {
      await this.settle();
      await this.versionHistory.snapshot(
        this.currentDocId(),
        this.liveDoc(),
        'named',
        name || 'Saved version',
      );
      await this.loadVersions();
      this.toast.success('Version saved');
    } catch (e) {
      console.warn('Failed to save version:', e);
      this.toast.error(
        e instanceof StorageError && e.reason === 'quota'
          ? 'Storage is full, so the version could not be saved.'
          : 'The version could not be saved',
      );
    } finally {
      this.historyBusy.set(false);
    }
  }

  async deleteVersion(meta: VersionMeta): Promise<void> {
    const when = new Date(meta.createdAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete this version?',
      message: `The version${meta.name ? ` "${meta.name}"` : ''} from ${when} will be permanently deleted. Your document is not changed.`,
      confirmText: 'Delete version',
      isDestructive: true,
      icon: 'delete_outline',
    });
    if (!confirmed) return;
    try {
      await this.versionHistory.remove(meta.docId, meta.id);
      if (this.previewVersion()?.id === meta.id) this.exitPreview();
      await this.loadVersions();
    } catch {
      this.toast.error('The version could not be deleted');
    }
  }
}
