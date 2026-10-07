import {
  Component,
  computed,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  SCHEMA_VERSION,
  schema,
  docToHtml,
  docToMarkdown,
  imageStorage,
  migrate,
} from './editor';
import { ThemeService } from './core/theme.service';

const DEMO_DOC: StoredDoc = {
  schemaVersion: SCHEMA_VERSION,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Welcome to Inkframe' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Inkframe is a high-performance, signal-driven rich text editor for Angular. It embeds ProseMirror as its editing engine and uses pure Angular components for all interface elements.',
          },
        ],
      },
      {
        type: 'callout',
        attrs: { type: 'info' },
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'strong' }],
                text: 'Quick Tip: ',
              },
              {
                type: 'text',
                text: 'Type ',
              },
              {
                type: 'text',
                marks: [{ type: 'code' }],
                text: '/',
              },
              {
                type: 'text',
                text: ' on any empty line to trigger the slash menu, or highlight any text to open the floating formatting toolbar.',
              },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Interactive Features' }],
      },
      {
        type: 'bullet_list',
        content: [
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'strong' }],
                    text: 'IndexedDB Image Storage: ',
                  },
                  {
                    type: 'text',
                    text: 'Upload, drag & drop, or paste images directly. Blobs are securely saved client-side.',
                  },
                ],
              },
            ],
          },
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'strong' }],
                    text: 'Markdown & HTML IO: ',
                  },
                  {
                    type: 'text',
                    text: 'Seamless bidirectional conversion with DOMPurify sanitization.',
                  },
                ],
              },
            ],
          },
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    marks: [{ type: 'strong' }],
                    text: 'SSR Safe: ',
                  },
                  {
                    type: 'text',
                    text: 'Hydrates cleanly and runs ProseMirror exclusively on the browser.',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Keyboard Shortcuts' }],
      },
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              {
                type: 'table_header',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Shortcut' }],
                  },
                ],
              },
              {
                type: 'table_header',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Action' }],
                  },
                ],
              },
              {
                type: 'table_header',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Scope' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'table_row',
            content: [
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + B' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Toggle Bold text' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Inline selection' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'table_row',
            content: [
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + I' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Toggle Italic text' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Inline selection' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Code Block Example' }],
      },
      {
        type: 'code_block',
        content: [
          {
            type: 'text',
            text: "// Angular Signal Integration\nconst isBold = signal(false);\nconst title = computed(() => `Status: ${isBold() ? 'Active' : 'Idle'}`);",
          },
        ],
      },
      {
        type: 'callout',
        attrs: { type: 'success' },
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'All changes are automatically debounced and emitted through signals. Try editing this document!',
              },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Image Preview & Lightbox' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Click on the image below in Editor, Preview, or Shared view to open the interactive full-screen lightbox:',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'image',
            attrs: {
              src: 'https://plus.unsplash.com/premium_photo-1790376728632-cb5a4b08f437?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
              alt: 'Abstract Art - Inkframe Demonstration',
              title: 'Abstract Art - Inkframe Demonstration',
            },
          },
        ],
      },
    ],
  },
};

function encodeDocToUrl(doc: StoredDoc): string {
  try {
    const json = JSON.stringify(doc);
    const bytes = new TextEncoder().encode(json);
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    const b64 = btoa(binary);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    return `${origin}${pathname}?view=preview#share=${encodeURIComponent(b64)}`;
  } catch (e) {
    console.error('Error generating share URL:', e);
    return typeof window !== 'undefined' ? window.location.href : '';
  }
}

function decodeDocFromUrl(hash: string): StoredDoc | null {
  try {
    const match = hash.match(/share=([^&]+)/);
    if (!match) return null;
    const b64 = decodeURIComponent(match[1]);
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const doc = JSON.parse(json) as StoredDoc;
    if (doc && doc.doc) return doc;
  } catch (e) {
    console.error('Failed to parse document from URL hash:', e);
  }
  return null;
}

@Component({
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    EditorComponent,
    ImageLightboxComponent,
  ],
  selector: 'app-root',
  host: {
    ngSkipHydration: 'true',
  },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly themeService = inject(ThemeService);

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

  protected readonly editor = viewChild<EditorComponent>('inkEditor');

  protected readonly wordCount = computed(() => {
    const text = this.extractText(this.currentDoc().doc);
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  });

  protected readonly charCount = computed(() => {
    return this.extractText(this.currentDoc().doc).length;
  });

  constructor() {
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

      if (hash && hash.includes('share=')) {
        const decoded = decodeDocFromUrl(hash);
        if (decoded) {
          this.currentDoc.set(decoded);
          this.shareUrl.set(window.location.href);
        }
      } else {
        // Asynchronously load from IndexedDB with localStorage fallback
        const saved = await imageStorage.getDocument<StoredDoc>('inkframe_saved_doc');
        if (saved && saved.doc) {
          this.currentDoc.set(saved);
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
    void imageStorage.saveDocument('inkframe_saved_doc', doc);
    if (this.activeTab() === 'preview') {
      await this.refreshPreviewHtml();
    }
  }

  private async refreshPreviewHtml(): Promise<void> {
    const ed = this.editor();
    let html = ed ? ed.getHtml() : this.convertDocToHtml(this.currentDoc());
    if (html) {
      html = await imageStorage.resolveHtmlImages(html);
    }
    this.sanitizedPreviewHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
  }

  protected async shareDocument(): Promise<void> {
    const ed = this.editor();
    ed?.flush();
    const doc = ed ? ed.getJSON() : this.currentDoc();

    // 1. Open the modal INSTANTLY (0ms response to user click!)
    this.showShareModal.set(true);
    this.isGeneratingShareLink.set(true);

    try {
      // In-line all ink-idb images as Base64 data URLs for portable sharing
      const shareableDoc = await imageStorage.inlineDocImages(doc);
      this.currentDoc.set(shareableDoc);

      // Save asynchronously to IndexedDB (non-blocking!)
      void imageStorage.saveDocument('inkframe_saved_doc', shareableDoc);
      this.isDirty.set(false);

      // Generate content-only share URL with fast chunked encoding
      const url = encodeDocToUrl(shareableDoc);
      this.shareUrl.set(url);

      // Copy to clipboard in background
      await this.copyShareLink();
    } finally {
      this.isGeneratingShareLink.set(false);
    }
  }

  protected async copyShareLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.copiedShareLink.set(true);
      setTimeout(() => this.copiedShareLink.set(false), 2500);
    } catch (e) {
      console.error('Failed to copy share link:', e);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.saveDocument();
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
    await imageStorage.saveDocument('inkframe_saved_doc', doc);
    this.isDirty.set(false);
    this.justSaved.set(true);
    setTimeout(() => this.justSaved.set(false), 2000);
  }

  protected async loadDemo(): Promise<void> {
    this.editor()?.loadDoc(DEMO_DOC);
    this.currentDoc.set(DEMO_DOC);
    this.isDirty.set(false);
    this.shareUrl.set('');
    await imageStorage.saveDocument('inkframe_saved_doc', DEMO_DOC);
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
        alt: img.getAttribute('alt') || '',
        title: img.getAttribute('title') || '',
      });
    }
  }

  protected closePreviewLightbox(): void {
    this.previewLightbox.set(null);
  }

  // ── Export & Import (PDF, Docs, Markdown, HTML) ───────────────────
  protected async exportPdf(): Promise<void> {
    if (typeof document === 'undefined') return;
    const rawHtml = this.editor()?.getHtml() || this.convertDocToHtml(this.currentDoc());
    // Resolve all images to data URLs for printing iframe
    const html = await imageStorage.resolveHtmlImages(rawHtml, true);
    const title = this.title() || 'Inkframe Document';

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            @page { margin: 20mm 15mm; size: auto; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111; padding: 10px; }
            h1 { font-size: 26px; font-weight: 700; margin-bottom: 12px; }
            h2 { font-size: 20px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; }
            h3 { font-size: 16px; font-weight: 600; margin-top: 16px; margin-bottom: 6px; }
            p { margin: 8px 0; }
            ul, ol { padding-left: 24px; margin: 8px 0; }
            li { margin: 4px 0; }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; }
            th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: 600; }
            blockquote { border-left: 3px solid #2563eb; padding-left: 12px; margin: 12px 0; color: #555; font-style: italic; }
            code { font-family: monospace; font-size: 13px; background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
            pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; border: 1px solid #e0e0e0; }
            .callout { border-left: 4px solid #2563eb; padding: 10px 14px; margin: 12px 0; background: #f0f7ff; border-radius: 4px; }
            .callout-warning { border-left-color: #d97706; background: #fffbeb; }
            .callout-success { border-left-color: #16a34a; background: #f0fdf4; }
            .callout-danger { border-left-color: #dc2626; background: #fef2f2; }
            img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `);
      doc.close();

      const printIframe = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      };

      const imgs = iframe.contentDocument?.images;
      if (imgs && imgs.length > 0) {
        let loaded = 0;
        const total = imgs.length;
        const onDone = () => {
          loaded++;
          if (loaded >= total) {
            setTimeout(printIframe, 150);
          }
        };
        for (let i = 0; i < total; i++) {
          if (imgs[i].complete) {
            loaded++;
          } else {
            imgs[i].onload = onDone;
            imgs[i].onerror = onDone;
          }
        }
        if (loaded >= total) {
          setTimeout(printIframe, 200);
        }
      } else {
        setTimeout(printIframe, 200);
      }
    }
  }

  protected async exportDocs(): Promise<void> {
    const rawHtml = this.editor()?.getHtml() || this.convertDocToHtml(this.currentDoc());
    // Resolve all images to Base64 data URLs for Microsoft Word
    const html = await imageStorage.resolveHtmlImages(rawHtml, true);
    const title = this.title() || 'Inkframe Document';
    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${title}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #111827; }
          h1 { font-size: 22pt; font-weight: bold; color: #111827; margin: 18pt 0 6pt; }
          h2 { font-size: 16pt; font-weight: bold; color: #1f2937; margin: 14pt 0 4pt; }
          h3 { font-size: 13pt; font-weight: bold; color: #374151; margin: 10pt 0 3pt; }
          p { margin: 6pt 0; }
          table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
          th, td { border: 1px solid #d1d5db; padding: 6pt 8pt; text-align: left; }
          th { background-color: #f3f4f6; font-weight: bold; }
          blockquote { border-left: 3pt solid #2563eb; padding-left: 10pt; color: #4b5563; font-style: italic; margin: 8pt 0; }
          code { font-family: 'Consolas', monospace; font-size: 10pt; background-color: #f3f4f6; padding: 2pt 4pt; }
          pre { font-family: 'Consolas', monospace; font-size: 10pt; background-color: #f3f4f6; padding: 8pt; border: 1px solid #e5e7eb; }
          .callout { border-left: 4pt solid #2563eb; padding: 8pt 12pt; margin: 8pt 0; background-color: #eff6ff; }
          .callout-warning { border-left-color: #d97706; background-color: #fffbeb; }
          .callout-success { border-left-color: #16a34a; background-color: #f0fdf4; }
          .callout-danger { border-left-color: #dc2626; background-color: #fef2f2; }
          img { max-width: 100%; height: auto; margin: 6pt 0; }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;
    this.downloadFile(docContent, 'inkframe-document.doc', 'application/msword');
  }

  protected async exportMarkdown(): Promise<void> {
    let md = this.editor()?.getMarkdown() || '';
    if (!md) {
      try {
        const node = schema.nodeFromJSON(migrate(this.currentDoc()));
        md = docToMarkdown(node);
      } catch { }
    }
    md = await imageStorage.resolveMarkdownImages(md);
    this.downloadFile(md, 'inkframe-document.md', 'text/markdown');
  }

  protected importMarkdown(): void {
    this.pickFile('.md,text/markdown,.html,text/html,.txt,text/plain', async (content, filename) => {
      const isHtml = filename.endsWith('.html') || filename.endsWith('.htm') || content.trim().startsWith('<');
      if (isHtml) {
        this.editor()?.loadHtml(content);
      } else {
        this.editor()?.loadMarkdown(content);
      }
      this.isDirty.set(true);
      await this.refreshPreviewHtml();
    });
  }

  private pickFile(accept: string, onLoad: (content: string, filename: string) => void): void {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => onLoad((reader.result as string) || '', file.name);
        reader.readAsText(file);
      }
    };
    input.click();
  }

  private downloadFile(content: string, filename: string, type: string): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private extractText(node: any): string {
    if (!node) return '';
    if (node.text) return node.text;
    if (node.content && Array.isArray(node.content)) {
      return node.content.map((c: any) => this.extractText(c)).join(' ');
    }
    return '';
  }
}
