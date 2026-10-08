import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  EditorComponent,
  ImageLightboxComponent,
  type ImagePreviewPayload,
  StoredDoc,
  schema,
  docToHtml,
  docToMarkdown,
  imageStorage,
  migrate,
} from '../../editor';
import { ThemeService } from '../../core/theme.service';
import {
  DocumentManagerService,
  DocMeta,
  formatRelativeTime,
  extractDocTitle,
} from '../../core/document-manager.service';
import { WELCOME_DOC } from '../../core/welcome-doc';

const DEMO_DOC: StoredDoc = WELCOME_DOC;

function arrayBufferToBinary(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return binary;
}

async function encodeDocToUrl(doc: StoredDoc): Promise<string> {
  try {
    const json = JSON.stringify(doc);
    let b64 = '';

    const canGzip =
      typeof CompressionStream !== 'undefined' &&
      typeof Response !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof (Blob.prototype as unknown as { stream?: unknown })?.stream === 'function';

    if (canGzip) {
      try {
        const stream = new Blob([json], { type: 'application/json' })
          .stream()
          .pipeThrough(new CompressionStream('gzip'));
        const compressedBuffer = await new Response(stream).arrayBuffer();
        b64 = 'gz.' + btoa(arrayBufferToBinary(compressedBuffer));
      } catch (streamErr) {
        console.warn('CompressionStream pipeline failed, falling back to raw btoa:', streamErr);
        b64 = btoa(encodeURIComponent(json));
      }
    } else {
      b64 = btoa(encodeURIComponent(json));
    }

    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?view=preview#share=${encodeURIComponent(b64)}`;
  } catch (e) {
    console.error('Error encoding document to URL:', e);
    return window.location.href;
  }
}

async function decodeDocFromUrl(hash: string): Promise<StoredDoc | null> {
  try {
    const match = hash.match(/#share=([^&]+)/);
    if (!match) return null;
    const rawVal = decodeURIComponent(match[1]);

    if (rawVal.startsWith('gz.')) {
      const b64 = rawVal.slice(3);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      if (typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([bytes])
          .stream()
          .pipeThrough(new DecompressionStream('gzip'));
        const decompressed = await new Response(stream).text();
        return JSON.parse(decompressed) as StoredDoc;
      }
    }

    const decodedStr = decodeURIComponent(atob(rawVal));
    return JSON.parse(decodedStr) as StoredDoc;
  } catch (e) {
    console.warn('Failed to parse document from URL hash:', e);
    return null;
  }
}

@Component({
  selector: 'ink-editor-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    EditorComponent,
    ImageLightboxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-page.component.html',
  styleUrl: './editor-page.component.scss',
})
export class EditorPageComponent implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly themeService = inject(ThemeService);
  protected readonly docManager = inject(DocumentManagerService);

  protected readonly title = signal('Inkframe');
  protected readonly currentDoc = signal<StoredDoc>(DEMO_DOC);
  protected readonly activeTab = signal<'edit' | 'preview'>('edit');
  protected readonly isPublicView = signal(false);
  protected readonly isDirty = signal(false);
  protected readonly showShareModal = signal(false);
  protected readonly isGeneratingShareLink = signal(false);
  protected readonly shareUrl = signal('');
  protected readonly copiedShareLink = signal(false);
  protected readonly justSaved = signal(false);
  protected readonly sanitizedPreviewHtml = signal<SafeHtml>('');
  protected readonly previewLightbox = signal<ImagePreviewPayload | null>(null);

  // Documents and History Management
  protected readonly showDocDrawer = signal(false);
  protected readonly docList = signal<DocMeta[]>([]);
  protected readonly activeDocId = signal<string>('doc_default');
  protected readonly searchQuery = signal<string>('');
  protected readonly docToDelete = signal<DocMeta | null>(null);

  protected readonly editor = viewChild<EditorComponent>('inkEditor');

  protected readonly currentDocTitle = computed(() => {
    const list = this.docList();
    const active = list.find((d) => d.id === this.activeDocId());
    if (active?.title) return active.title;
    return extractDocTitle(this.currentDoc()) || 'Untitled Document';
  });

  protected readonly filteredDocs = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.docList();
    if (!q) return list;
    return list.filter((d) => d.title.toLowerCase().includes(q));
  });

  protected readonly wordCount = computed(() => {
    const text = this.extractText(this.currentDoc().doc);
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  });

  protected readonly charCount = computed(() => {
    return this.extractText(this.currentDoc().doc).length;
  });

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      void this.initClientState();
    }
  }

  private async initClientState(): Promise<void> {
    try {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      // Check if URL has ?view=preview (content-only public view)
      if (params.get('view') === 'preview') {
        this.isPublicView.set(true);
      }

      // Initialize documents list from IndexedDB / Storage
      let list = await this.docManager.getIndex();
      if (list.length === 0) {
        const saved = await imageStorage.getDocument<StoredDoc>('inkframe_saved_doc');
        const initialDoc = (saved && saved.doc) ? saved : DEMO_DOC;
        const initialTitle = extractDocTitle(initialDoc) || 'Welcome to Inkframe';
        const meta = await this.docManager.saveDoc('doc_default', initialDoc, initialTitle);
        list = [meta];
      }
      this.docList.set(list);

      let activeId = this.docManager.getActiveDocId();
      if (!list.some((d) => d.id === activeId)) {
        activeId = list[0]?.id || 'doc_default';
        this.docManager.setActiveDocId(activeId);
      }
      this.activeDocId.set(activeId);

      if (params.get('demo') === 'true') {
        await this.loadDemo();
        return;
      }

      if (params.get('new') === 'true') {
        await this.createNewDoc();
        return;
      }

      if (hash && hash.includes('share=')) {
        const decoded = await decodeDocFromUrl(hash);
        if (decoded) {
          this.currentDoc.set(decoded);
          this.editor()?.loadDoc(decoded);
          this.shareUrl.set(window.location.href);
          const title = 'Shared: ' + extractDocTitle(decoded);
          await this.docManager.saveDoc(activeId, decoded, title);
          this.docList.set(await this.docManager.getIndex());
        } else {
          // Graceful fallback: If URL hash was truncated, recover from storage
          const loaded = await this.docManager.getDoc(activeId);
          if (loaded && loaded.doc) {
            this.currentDoc.set(loaded);
            this.editor()?.loadDoc(loaded);
          }
        }
      } else {
        const loaded = await this.docManager.getDoc(activeId);
        if (loaded && loaded.doc) {
          this.currentDoc.set(loaded);
          this.editor()?.loadDoc(loaded);
        }
      }

      await this.refreshPreviewHtml();
    } catch (e) {
      console.error('Error initializing client state:', e);
    }
  }

  protected async setTab(tab: 'edit' | 'preview'): Promise<void> {
    this.activeTab.set(tab);
    if (tab === 'preview') {
      this.editor()?.blur();
      await this.refreshPreviewHtml();
    }
  }

  protected async onChanged(doc: StoredDoc): Promise<void> {
    this.currentDoc.set(doc);
    this.isDirty.set(true);
    await this.docManager.saveDoc(this.activeDocId(), doc);
    this.docList.set(await this.docManager.getIndex());
    if (this.activeTab() === 'preview') {
      await this.refreshPreviewHtml();
    }
  }

  private refreshPreviewHtml(): void {
    const ed = this.editor();
    const docToRender = ed ? ed.getJSON() : this.currentDoc();
    const rawHtml = this.convertDocToHtml(docToRender);
    this.sanitizedPreviewHtml.set(
      this.sanitizer.bypassSecurityTrustHtml(rawHtml),
    );
  }

  /* ── Document Management & History Operations ── */
  protected async openDocDrawer(): Promise<void> {
    const list = await this.docManager.getIndex();
    this.docList.set(list);
    this.showDocDrawer.set(true);
  }

  protected closeDocDrawer(): void {
    this.showDocDrawer.set(false);
  }

  protected async createNewDoc(): Promise<void> {
    await this.saveDocument();
    const created = await this.docManager.createDoc('Untitled Document');
    this.activeDocId.set(created.meta.id);
    this.currentDoc.set(created.doc);
    this.editor()?.loadDoc(created.doc);
    const list = await this.docManager.getIndex();
    this.docList.set(list);
    this.isDirty.set(false);
    this.showDocDrawer.set(false);
    await this.refreshPreviewHtml();
  }

  protected async switchDoc(id: string): Promise<void> {
    if (id === this.activeDocId()) {
      this.showDocDrawer.set(false);
      return;
    }
    await this.saveDocument();
    const loaded = await this.docManager.getDoc(id);
    if (loaded && loaded.doc) {
      this.activeDocId.set(id);
      this.currentDoc.set(loaded);
      this.editor()?.loadDoc(loaded);
      this.docManager.setActiveDocId(id);
      this.isDirty.set(false);
      await this.refreshPreviewHtml();
    }
    this.showDocDrawer.set(false);
  }

  protected promptDeleteDoc(item: DocMeta, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.docToDelete.set(item);
  }

  protected cancelDeleteDoc(): void {
    this.docToDelete.set(null);
  }

  protected async confirmDeleteDoc(): Promise<void> {
    const target = this.docToDelete();
    if (!target) return;
    this.docToDelete.set(null);
    await this.deleteDoc(target.id);
  }

  protected async deleteDoc(id: string, event?: MouseEvent): Promise<void> {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const wasActive = id === this.activeDocId();
    const nextId = await this.docManager.deleteDoc(id);
    const list = await this.docManager.getIndex();
    this.docList.set(list);
    if (wasActive) {
      const loaded = await this.docManager.getDoc(nextId);
      if (loaded && loaded.doc) {
        this.activeDocId.set(nextId);
        this.currentDoc.set(loaded);
        this.editor()?.loadDoc(loaded);
        this.docManager.setActiveDocId(nextId);
        this.isDirty.set(false);
        await this.refreshPreviewHtml();
      }
    }
  }

  protected async duplicateDoc(id: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const duplicated = await this.docManager.duplicateDoc(id);
    this.activeDocId.set(duplicated.meta.id);
    this.currentDoc.set(duplicated.doc);
    this.editor()?.loadDoc(duplicated.doc);
    const list = await this.docManager.getIndex();
    this.docList.set(list);
    this.isDirty.set(false);
    this.showDocDrawer.set(false);
    await this.refreshPreviewHtml();
  }

  protected formatTime(timestamp: number): string {
    return formatRelativeTime(timestamp);
  }

  /* ── Sharing & Persistence Operations ── */
  protected async shareDocument(): Promise<void> {
    this.isGeneratingShareLink.set(true);
    this.copiedShareLink.set(false);
    this.shareUrl.set('Generating portable share link...');
    this.showShareModal.set(true);

    try {
      const ed = this.editor();
      let latestDoc = ed ? ed.getJSON() : this.currentDoc();
      this.currentDoc.set(latestDoc);

      const inlinedDoc = await imageStorage.inlineDocImages(latestDoc);
      this.currentDoc.set(inlinedDoc);

      await this.docManager.saveDoc(this.activeDocId(), inlinedDoc);

      const url = await encodeDocToUrl(inlinedDoc);
      this.shareUrl.set(url);
    } catch (e) {
      console.error('Failed to share document:', e);
      this.shareUrl.set(window.location.href);
    } finally {
      this.isGeneratingShareLink.set(false);
    }
  }

  protected async copyShareLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copiedShareLink.set(true);
      setTimeout(() => this.copiedShareLink.set(false), 2500);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  }

  protected openShareInNewTab(): void {
    const url = this.shareUrl();
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  @HostListener('window:hashchange')
  onHashChange(): void {
    void this.initClientState();
  }

  protected closeShareModal(): void {
    this.showShareModal.set(false);
  }

  protected async saveDocument(): Promise<void> {
    const ed = this.editor();
    const doc = ed ? ed.getJSON() : this.currentDoc();
    this.currentDoc.set(doc);
    await this.docManager.saveDoc(this.activeDocId(), doc);
    this.docList.set(await this.docManager.getIndex());
    this.isDirty.set(false);
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), 2000);
  }

  protected async loadDemo(): Promise<void> {
    this.editor()?.loadDoc(DEMO_DOC);
    this.currentDoc.set(DEMO_DOC);
    this.isDirty.set(false);
    this.shareUrl.set('');
    await this.docManager.saveDoc('doc_default', DEMO_DOC, 'Welcome to Inkframe');
    this.docList.set(await this.docManager.getIndex());
    await this.refreshPreviewHtml();
  }

  protected convertDocToHtml(stored: StoredDoc): string {
    try {
      const node = schema.nodeFromJSON(migrate(stored));
      return docToHtml(node);
    } catch (e) {
      console.error('Error converting doc to HTML:', e);
      return '';
    }
  }

  protected onPreviewClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const img = target?.closest('img');
    if (img && img.src) {
      event.preventDefault();
      event.stopPropagation();
      this.previewLightbox.set({
        src: img.src,
        alt: img.alt || '',
        title: img.title || undefined,
      });
    }
  }

  protected closePreviewLightbox(): void {
    this.previewLightbox.set(null);
  }

  /* ── Universal Document Export Formats ── */
  protected async exportDocs(): Promise<void> {
    const ed = this.editor();
    const doc = ed ? ed.getJSON() : this.currentDoc();
    const rawHtml = this.convertDocToHtml(doc);

    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${this.currentDocTitle()}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111827; }
          h1 { font-size: 20pt; color: #1e3a8a; }
          h2 { font-size: 16pt; color: #1e40af; }
          h3 { font-size: 13pt; color: #1d4ed8; }
          table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
          td, th { border: 1pt solid #cbd5e1; padding: 6pt; }
          th { background-color: #f1f5f9; font-weight: bold; }
          pre { background-color: #f8fafc; border: 1pt solid #e2e8f0; padding: 8pt; font-family: Consolas, monospace; }
          code { font-family: Consolas, monospace; background-color: #f1f5f9; }
          blockquote { border-left: 3pt solid #3b82f6; margin-left: 0; padding-left: 10pt; color: #475569; }
        </style>
      </head>
      <body>
        ${rawHtml}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', docContent], {
      type: 'application/msword',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentDocTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected async exportPdf(): Promise<void> {
    const ed = this.editor();
    const doc = ed ? ed.getJSON() : this.currentDoc();
    const rawHtml = this.convertDocToHtml(doc);

    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${this.currentDocTitle()}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            h1, h2, h3 { color: #0f172a; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            td, th { border: 1px solid #cbd5e1; padding: 8px 12px; }
            th { background-color: #f8fafc; }
            img { max-width: 100%; height: auto; border-radius: 4px; }
            pre { background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-family: monospace; }
            blockquote { border-left: 3px solid #0284c7; padding-left: 12px; color: #475569; font-style: italic; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${rawHtml}
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 250);
  }

  protected exportMarkdown(): void {
    const ed = this.editor();
    const text = ed ? ed.getMarkdown() : '';
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentDocTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected exportHtml(): void {
    const ed = this.editor();
    const html = ed ? ed.getHtml() : '';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentDocTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'document'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected importMarkdown(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const ed = this.editor();
      if (ed) {
        ed.loadMarkdown(text);
      }
    };
    input.click();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      void this.saveDocument();
    } else if (event.key === 'Escape') {
      if (this.docToDelete()) {
        this.cancelDeleteDoc();
      } else if (this.showDocDrawer()) {
        this.closeDocDrawer();
      } else if (this.showShareModal()) {
        this.closeShareModal();
      }
    }
  }

  private extractText(node: any): string {
    if (!node) return '';
    if (node.text) return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map((child: any) => this.extractText(child)).join(' ');
    }
    return '';
  }
}
