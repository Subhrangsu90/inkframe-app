import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InkIcon } from '../../shared/ui/icons/icon';
import { DocumentManager, extractDocTitle } from '../../core/document-manager';
import { WELCOME_DOC } from '../../core/welcome-doc';
import { docToHtml, schema, markdownToDoc, SCHEMA_VERSION } from '@inkframe-ui/editor/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LayoutService } from '../../shared/layout/layout.service';
import { ToastService } from '../../shared/ui';

@Component({
  selector: 'ink-reader',
  standalone: true,
  imports: [CommonModule, RouterLink, InkIcon],
  templateUrl: './reader.html',
  styleUrl: './reader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reader implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly docManager = inject(DocumentManager);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly layout = inject(LayoutService);
  private readonly toast = inject(ToastService);

  // Dynamic header templates
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

  readonly docId = signal<string>('doc_default');
  readonly docTitle = signal<string>('Shared Document');
  readonly renderedHtml = signal<SafeHtml>('');

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(async (params) => {
      const hash = params.get('hash') || 'doc_default';
      this.docId.set(hash);

      let active = await this.docManager.getDoc(hash);

      // If not directly in storage, check if base64 encoded document
      if (!active && hash !== 'doc_default') {
        try {
          const decoded = atob(decodeURIComponent(hash));
          if (decoded.trim().startsWith('{')) {
            const parsed = JSON.parse(decoded);
            if (parsed.doc) {
              active = parsed;
            }
          } else if (decoded.trim()) {
            const pmNode = markdownToDoc(decoded);
            active = { schemaVersion: SCHEMA_VERSION, doc: pmNode.toJSON() };
          }
        } catch {}
      }

      if (!active) {
        active = (await this.docManager.getDoc('doc_default')) || WELCOME_DOC;
      }

      const title = extractDocTitle(active);
      this.docTitle.set(title);

      if (active?.doc) {
        try {
          const pmNode = schema.nodeFromJSON(active.doc);
          const raw = docToHtml(pmNode);
          this.renderedHtml.set(this.sanitizer.bypassSecurityTrustHtml(raw));
        } catch (e) {
          console.warn('Failed to parse doc in reader:', e);
          this.renderedHtml.set('<p>Unable to render shared document.</p>');
        }
      }
    });
  }

  copyShareLink(): void {
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      this.toast.success('Reader link copied to clipboard!');
    }
  }
}