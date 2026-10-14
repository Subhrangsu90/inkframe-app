import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InkIcon } from '../../shared/ui/icons/icon';
import { DocumentManager, type StoredDoc, extractDocTitle } from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';
import {
  docToHtml,
  migrate,
  sanitizeHtml,
  schema,
  ThemeService,
  imageStorage,
} from '@inkframe-ui/editor/core';
import { ImageLightbox, type ImagePreviewPayload } from '@inkframe-ui/editor/extensions';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '../../shared/ui';
import { decompressSharedDoc, buildShareableUrl } from '../../core/share-codec';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'ink-reader',
  standalone: true,
  imports: [CommonModule, RouterLink, InkIcon, ImageLightbox],
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class Reader implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly docManager = inject(DocumentManager);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  readonly themeService = inject(ThemeService);

  readonly isDark = computed(() => this.themeService.theme() === 'dark');
  readonly docId = signal<string>('doc_default');
  readonly docTitle = signal<string>('Shared Document');
  readonly activeDoc = signal<StoredDoc | null>(null);
  readonly isSharedPayload = signal<boolean>(false);
  readonly renderedHtml = signal<SafeHtml>('');
  readonly previewImage = signal<ImagePreviewPayload | null>(null);

  /** Incremented per load so a slower, older load cannot overwrite a newer one. */
  private loadToken = 0;

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
        if (hash.startsWith('c_') || hash.startsWith('u_')) {
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
        if (!active && hash !== 'doc_default') {
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
        this.activeDoc.set(active);
        this.docTitle.set(title);
        this.isSharedPayload.set(isShared);

        if (active?.doc) {
          try {
            const pmNode = schema.nodeFromJSON(migrate(active));
            const raw = docToHtml(pmNode);
            const resolved = await imageStorage.resolveHtmlImages(raw);
            if (token !== this.loadToken) return;
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

  async copyShareLink(): Promise<void> {
    try {
      const doc = this.activeDoc() || WELCOME_DOC;
      const url = await buildShareableUrl(doc, this.docTitle());
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.toast.success('Shareable link copied to clipboard!');
      }
    } catch {
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
      await this.router.navigate(['/doc', id]);
    } else {
      await this.router.navigate(['/doc', this.docId()]);
    }
  }
}
