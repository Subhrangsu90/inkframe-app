import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LayoutService } from '../../shared/layout/layout.service';
import { DocumentManager, DocMeta, formatRelativeTime } from '../../core/document-manager';
import { InkIcon, InkIconName } from '../../shared/ui/icons/icon';
import { ToastService } from '../../shared/ui';
import { StoredDoc, SCHEMA_VERSION } from '@inkframe-ui/editor/core';
import { buildShareableUrl } from '../../core/share-codec';

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'inkframe-docs-view';

function savedViewMode(): ViewMode {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export interface TemplateStarter {
  id: string;
  title: string;
  icon: InkIconName;
  desc: string;
  doc: StoredDoc;
}

@Component({
  selector: 'ink-docs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    InkIcon,
  ],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class Docs implements OnInit {
  readonly layout = inject(LayoutService);
  private readonly docManager = inject(DocumentManager);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // Dynamic header templates
  readonly headerLeftTpl = viewChild<TemplateRef<any>>('headerLeft');
  readonly headerCenterTpl = viewChild<TemplateRef<any>>('headerCenter');
  readonly headerRightTpl = viewChild<TemplateRef<any>>('headerRight');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

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

  readonly searchQuery = signal<string>('');
  readonly viewMode = signal<ViewMode>(savedViewMode());

  readonly templates: TemplateStarter[] = [
    {
      id: 'blank',
      title: 'Blank Document',
      icon: 'file-text',
      desc: 'Start writing with a clean slate',
      doc: {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Untitled Document' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Start writing your thoughts here...' }] },
          ],
        },
      },
    },
    {
      id: 'meeting',
      title: 'Meeting Notes',
      icon: 'layers',
      desc: 'Attendees, agenda, action items',
      doc: {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Team Sync & Agenda' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Attendees' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Alex, Sarah, Jordan, Subhrangsu' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key Decisions' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '1. Ship the new modular sidebar architecture.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '2. Keep offline local-first privacy standard.' }] },
          ],
        },
      },
    },
    {
      id: 'tech-spec',
      title: 'Technical Spec',
      icon: 'code',
      desc: 'Architecture, schema, benchmarks',
      doc: {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Architecture RFC' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'This design doc outlines the client-side ProseMirror editor system.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Data Pipeline' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Zero server dependencies, 100% client-side IndexedDB persistence.' }] },
          ],
        },
      },
    },
    {
      id: 'blog',
      title: 'Blog Post Draft',
      icon: 'star',
      desc: 'Hook, body paragraphs, takeaway',
      doc: {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Crafting Minimal Interfaces' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Good design gets out of the user\'s way.' }] },
          ],
        },
      },
    },
  ];

  readonly filteredDocs = computed<DocMeta[]>(() => {
    const list = this.layout.documents();
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter((d) => d.title.toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    await this.layout.refreshDocs();
    if (await this.docManager.backfillExcerpts()) {
      await this.layout.refreshDocs();
    }
  }

  /** "/" focuses search, as in most document apps. */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  formatTime(timestamp: number): string {
    return formatRelativeTime(timestamp);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {}
  }

  async createNewDoc(): Promise<void> {
    await this.layout.createNewDoc();
  }

  async createFromTemplate(tpl: TemplateStarter): Promise<void> {
    try {
      const created = await this.docManager.createDoc(tpl.title, tpl.doc);
      await this.layout.refreshDocs();
      this.toast.success(`Created "${tpl.title}" from template`);
      await this.router.navigate(['/doc', created.meta.id]);
    } catch {
      this.toast.error('Failed to create template');
    }
  }

  async duplicateDoc(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    try {
      const dup = await this.docManager.duplicateDoc(id);
      await this.layout.refreshDocs();
      this.toast.success('Document duplicated');
      await this.router.navigate(['/doc', dup.meta.id]);
    } catch {
      this.toast.error('Failed to duplicate document');
    }
  }

  async deleteDoc(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.layout.deleteDoc(id, event);
  }

  async shareDocLink(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    try {
      const doc = await this.docManager.getDoc(id);
      if (doc) {
        const meta = this.layout.documents().find((d: DocMeta) => d.id === id);
        const url = await buildShareableUrl(doc, meta?.title);
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          this.toast.success('Shareable link copied to clipboard!');
        }
      } else {
        this.toast.error('Document not found');
      }
    } catch {
      this.toast.error('Failed to copy share link');
    }
  }
}
