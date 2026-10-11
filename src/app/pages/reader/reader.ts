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
  schema,
  ThemeService,
  imageStorage,
} from '@inkframe-ui/editor/core';
import { ImageLightbox, type ImagePreviewPayload } from '@inkframe-ui/editor/extensions';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '../../shared/ui';
import { decompressSharedDoc, buildShareableUrl } from '../../core/share-codec';

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

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      const hash = params.get('hash') || 'doc_default';
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

      this.activeDoc.set(active);
      this.docTitle.set(title);
      this.isSharedPayload.set(isShared);

      if (active?.doc) {
        try {
          const pmNode = schema.nodeFromJSON(active.doc);
          const raw = docToHtml(pmNode);
          const resolved = await imageStorage.resolveHtmlImages(raw);
          this.renderedHtml.set(this.sanitizer.bypassSecurityTrustHtml(resolved));
        } catch (e) {
          console.warn('Failed to parse doc in reader:', e);
          this.renderedHtml.set('<p>Unable to render shared document.</p>');
        }
      }
    });
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

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  async copyShareLink(): Promise<void> {
    try {
      const doc = this.activeDoc() || WELCOME_DOC;
      const url = await buildShareableUrl(doc, this.docTitle());
      if (typeof window !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.toast.success('Shareable link copied to clipboard!');
      }
    } catch (e) {
      this.toast.error('Failed to copy shareable link');
    }
  }

  async openInEditor(): Promise<void> {
    const doc = this.activeDoc();
    if (!doc) return;

    if (this.isSharedPayload()) {
      // Import this shared document into the user's local storage
      const created = await this.docManager.createDoc(this.docTitle());
      await this.docManager.saveDoc(created.meta.id, doc, this.docTitle());
      this.toast.success('Saved to your notes! Opening editor...');
      await this.router.navigate(['/doc', created.meta.id]);
    } else {
      await this.router.navigate(['/doc', this.docId()]);
    }
  }
}