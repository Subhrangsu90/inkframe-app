import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageMetaStrategy } from '@app/core/page-meta';
import { InkIcon } from '@app/shared/ui/icons/icon';
import {
  DocumentManager,
  type StoredDoc,
  extractDocTitle,
} from '@app/features/documents/data-access/document-manager';
import { WELCOME_DOC } from '@app/features/documents/data-access/welcome-doc';
import { docPath } from '@app/features/documents/documents.paths';
import {
  DEFAULT_PAGE_SETUP,
  PageSetup,
  docToHtml,
  findDocumentFont,
  findPageColor,
  migrate,
  pageLayoutStyle,
  pageMarginBoxCss,
  pageRuleCss,
  pageSetupOf,
  pageViewStyle,
  sanitizeHtml,
  schema,
  ThemeService,
  imageStorage,
} from '@inkframe-ui/editor/core';
import {
  ImageLightbox,
  PageFrames,
  PageView,
  type ImagePreviewPayload,
} from '@inkframe-ui/editor/ui';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '@app/shared/ui/toast/toast';
import { copyText } from '@app/core/clipboard';
import {
  decompressSharedDoc,
  buildShareableUrl,
} from '@app/features/documents/transfer/share-codec';
import { combineLatest } from 'rxjs';

/** Header and footer text when the browser prints the reader page: 0.8 × the 14px text, in the document's font. */
const marginTextFont = (setup: PageSetup) => `11.2px ${findDocumentFont(setup.font).stack}`;

@Component({
  selector: 'ink-reader',
  standalone: true,
  imports: [CommonModule, RouterLink, InkIcon, ImageLightbox, PageFrames, PageView],
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class Reader implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly docManager = inject(DocumentManager);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  readonly themeService = inject(ThemeService);
  private readonly pageMeta = inject(PageMetaStrategy);
  private readonly document = inject(DOCUMENT);

  readonly isDark = computed(() => this.themeService.theme() === 'dark');
  readonly docId = signal<string>('doc_default');
  readonly docTitle = signal<string>('Shared Document');
  // The tab shows the shared document's title.
  private readonly tabTitle = effect(() => this.pageMeta.setPageTitle(this.docTitle()));
  readonly activeDoc = signal<StoredDoc | null>(null);
  readonly isSharedPayload = signal<boolean>(false);
  readonly renderedHtml = signal<SafeHtml>('');
  readonly previewImage = signal<ImagePreviewPayload | null>(null);
  /** The document's page setup: the reader shows (and prints) it in its own layout. */
  readonly pageSetup = signal<PageSetup>(DEFAULT_PAGE_SETUP);
  /** Pages shown by page view (Pages layout, from 768px up); 0 when off. */
  readonly pageCount = signal(0);
  private readonly pageView = viewChild(PageView);
  readonly layoutStyle = computed(() => ({
    ...pageLayoutStyle(this.pageSetup()),
    ...pageViewStyle(this.pageCount()),
  }));

  // The browser's own Print menu prints this page: on the document's paper
  // and margins, its page color when the document asks for it (over the
  // whole sheet), and its header, footer and page numbers in Chrome, which
  // supports @page margin boxes. (Print and Ctrl+P go through printDoc.)
  private readonly printPageRule = effect((onCleanup) => {
    const setup = this.pageSetup();
    const color = setup.printColor ? findPageColor(setup.color)?.light : undefined;
    const rules = [pageRuleCss(setup), pageMarginBoxCss(setup, marginTextFont(setup))];
    if (color) {
      rules.push(
        `@page { background: ${color}; }`,
        `html, body, .reader-layout, .reader-viewport, .reader-canvas, .reader-sheet { background: ${color} !important; }`,
      );
    }
    const css = rules.filter(Boolean).join('\n');
    if (!css) return;
    const style = this.document.createElement('style');
    style.textContent = `@media print {\n${css}\n}`;
    this.document.head.appendChild(style);
    onCleanup(() => style.remove());
  });

  /** Incremented per load so a slower, older load cannot overwrite a newer one. */
  private loadToken = 0;
  private printing = false;

  async ngOnInit(): Promise<void> {
    // Share links carry the payload in the fragment (/s#<payload>); older links
    // and local document ids use the path (/s/<hash>).
    combineLatest([this.route.paramMap, this.route.fragment]).subscribe(
      async ([params, fragment]) => {
        const hash = params.get('hash') || fragment || 'doc_default';
        const token = ++this.loadToken;
        this.docId.set(hash);

        let active: StoredDoc | null = null;
        let title = 'Shared Document';
        let isShared = false;

        // 1. Check if hash is a compressed zero-backend payload
        const payload = hash.startsWith('c_') || hash.startsWith('u_');
        if (payload) {
          const decoded = await decompressSharedDoc(hash);
          if (decoded) {
            active = decoded.doc;
            title = decoded.title;
            isShared = true;
          }
        }

        // 2. If not a compressed payload, check local IndexedDB
        if (!active) {
          active = await this.docManager.getDoc(hash);
          if (active) {
            title = extractDocTitle(active);
            isShared = false;
          }
        }

        // 3. Check legacy base64 encoded document
        if (!active && hash !== 'doc_default' && !payload) {
          const decoded = await decompressSharedDoc(hash);
          if (decoded) {
            active = decoded.doc;
            title = decoded.title;
            isShared = true;
          }
        }

        // 4. Default fallback to Welcome doc
        if (!active) {
          active = (await this.docManager.getDoc('doc_default')) || WELCOME_DOC;
          title = extractDocTitle(active);
          isShared = false;
        }

        if (token !== this.loadToken) return;
        if (payload && !isShared) {
          // Cut short when copied, or crafted to unpack to more than a document could.
          this.toast.error(
            'This shared link could not be opened. It may be incomplete: ask for the link again.',
            8000,
          );
        }
        this.activeDoc.set(active);
        this.docTitle.set(title);
        this.isSharedPayload.set(isShared);

        if (active?.doc) {
          try {
            const pmNode = schema.nodeFromJSON(migrate(active));
            const raw = docToHtml(pmNode);
            const resolved = await imageStorage.resolveHtmlImages(raw);
            if (token !== this.loadToken) return;
            this.pageSetup.set(pageSetupOf(pmNode));
            // Shared documents come from the URL, i.e. from anyone. Angular's own
            // sanitizer would strip the editor's inline styles, so sanitize with
            // DOMPurify before marking the HTML as trusted.
            this.renderedHtml.set(this.sanitizer.bypassSecurityTrustHtml(sanitizeHtml(resolved)));
          } catch (e) {
            console.warn('Failed to parse doc in reader:', e);
            this.renderedHtml.set('<p>Unable to render shared document.</p>');
          }
        }
      },
    );
  }

  onSheetClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const img = target.closest('img');
    if (img && img.src) {
      event.preventDefault();
      event.stopPropagation();
      this.previewImage.set({
        src: img.src,
        alt: img.alt || '',
        title: img.title || img.alt || 'Document Image',
      });
    }
  }

  toggleTheme(event: Event): void {
    this.themeService.toggleTheme(event);
  }

  /**
   * Prints the document as the editor does: through a print copy with its
   * pages as shown here, their headers, footers and page numbers. Ctrl+P
   * does the same; the browser's own Print menu prints this page instead.
   */
  async printDoc(): Promise<void> {
    const active = this.activeDoc();
    if (!active || this.printing) return;
    this.printing = true;
    try {
      const doc = schema.nodeFromJSON(migrate(active));
      const pageStarts = this.pageView()?.pageStarts(doc) ?? null;
      // Loaded when printing: the export code it comes with (Markdown, for
      // one) is large, and most people only read.
      const { printDocument } = await import('@app/features/documents/transfer/doc-export');
      await printDocument(active, this.docTitle(), pageStarts);
    } catch (e) {
      console.warn('Print failed:', e);
      this.toast.error('The document could not be printed');
    } finally {
      this.printing = false;
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      void this.printDoc();
    }
  }

  async copyShareLink(): Promise<void> {
    try {
      const doc = this.activeDoc() || WELCOME_DOC;
      await copyText(buildShareableUrl(doc, this.docTitle()));
      this.toast.success('Shareable link copied to clipboard!');
    } catch (e) {
      console.warn('Copying the share link failed:', e);
      this.toast.error('Failed to copy shareable link');
    }
  }

  async openInEditor(): Promise<void> {
    const doc = this.activeDoc();
    if (!doc) return;

    if (this.isSharedPayload()) {
      // Import this shared document into the user's local storage
      let id: string;
      try {
        id = (await this.docManager.createDoc(this.docTitle(), doc)).meta.id;
      } catch {
        this.toast.error(
          'The document could not be saved: storage in this browser is full or blocked',
        );
        return;
      }
      this.toast.success('Saved to your notes! Opening editor...');
      await this.router.navigateByUrl(docPath(id));
    } else {
      await this.router.navigateByUrl(docPath(this.docId()));
    }
  }
}
