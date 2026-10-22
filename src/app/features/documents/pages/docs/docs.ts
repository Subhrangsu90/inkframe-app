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
import { LayoutService } from '@app/layout/layout.service';
import {
  DocumentManager,
  DocMeta,
  formatRelativeTime,
} from '@app/features/documents/data-access/document-manager';
import { DocumentLibrary } from '@app/features/documents/data-access/document-library';
import { docPath } from '@app/features/documents/documents.paths';
import { InkIcon, InkIconName } from '@app/shared/ui/icons/icon';
import { ToastService } from '@app/shared/ui';
import { StoredDoc, SCHEMA_VERSION } from '@inkframe-ui/editor/core';
import { buildShareableUrl } from '@app/features/documents/transfer/share-codec';
import {
  IMPORT_ACCEPT,
  ImportError,
  readImportFile,
} from '@app/features/documents/transfer/doc-import';
import { BACKUP_EXTENSION } from '@app/features/documents/transfer/backup';

const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files');

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'inkframe-docs-view';

function savedViewMode(): ViewMode {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(VIEW_MODE_KEY) === 'list'
      ? 'list'
      : 'grid';
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
  imports: [CommonModule, FormsModule, RouterLink, InkIcon],
  templateUrl: './docs.html',
  styleUrl: './docs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Docs implements OnInit {
  readonly layout = inject(LayoutService);
  readonly library = inject(DocumentLibrary);
  private readonly docManager = inject(DocumentManager);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly docPath = docPath;

  // Dynamic header templates
  readonly headerLeftTpl = viewChild<TemplateRef<unknown>>('headerLeft');
  readonly headerCenterTpl = viewChild<TemplateRef<unknown>>('headerCenter');
  readonly headerRightTpl = viewChild<TemplateRef<unknown>>('headerRight');
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

  readonly importAccept = IMPORT_ACCEPT;
  readonly importing = signal(false);
  /** Files are being dragged over the page. */
  readonly dropActive = signal(false);
  /** dragenter/dragleave also fire for every child element crossed; count them. */
  private dragDepth = 0;

  /** A blank document is New document, so it is not repeated here. */
  readonly templates: TemplateStarter[] = [
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
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Team Sync & Agenda' }],
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Attendees' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Alex, Sarah, Jordan, Subhrangsu' }],
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Key Decisions' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '1. Ship the new modular sidebar architecture.' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '2. Keep offline local-first privacy standard.' }],
            },
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
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Architecture RFC' }],
            },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'This design doc outlines the client-side ProseMirror editor system.',
                },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Data Pipeline' }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Zero server dependencies, 100% client-side IndexedDB persistence.',
                },
              ],
            },
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
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Crafting Minimal Interfaces' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: "Good design gets out of the user's way." }],
            },
          ],
        },
      },
    },
  ];

  readonly filteredDocs = computed<DocMeta[]>(() => {
    const list = this.library.documents();
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter((d) => d.title.toLowerCase().includes(q));
  });

  async ngOnInit(): Promise<void> {
    await this.library.refreshDocs();
    if (await this.docManager.backfillExcerpts()) {
      await this.library.refreshDocs();
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
    } catch {
      // Storage unavailable (private mode or blocked): the choice lasts for this visit.
    }
  }

  async createNewDoc(): Promise<void> {
    await this.library.createNewDoc();
  }

  // ── Import (button and drag and drop) ───────────────────────────
  protected onDragEnter(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault();
    this.dragDepth++;
    this.dropActive.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault(); // allows the drop
    event.dataTransfer!.dropEffect = 'copy';
  }

  protected onDragLeave(event: DragEvent): void {
    if (!hasFiles(event)) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dropActive.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault(); // otherwise the browser opens the file
    this.dragDepth = 0;
    this.dropActive.set(false);
    void this.importFiles(Array.from(event.dataTransfer!.files));
  }

  protected onImportChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // so choosing the same file again fires (change) again
    void this.importFiles(files);
  }

  /** Creates one document per Markdown or HTML file; opens it when there is one. */
  async importFiles(files: File[]): Promise<void> {
    if (files.length === 0 || this.importing()) return;
    this.importing.set(true);
    const created: string[] = [];
    const problems: string[] = [];
    try {
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(BACKUP_EXTENSION)) {
          problems.push(`"${file.name}" is a backup: restore it in Settings.`);
          continue;
        }
        try {
          const { title, doc } = await readImportFile(file);
          const { meta } = await this.docManager.createDoc(title, doc, { defaultPageSetup: true });
          created.push(meta.id);
        } catch (e) {
          problems.push(
            e instanceof ImportError ? e.message : `"${file.name}" could not be imported.`,
          );
        }
      }
      await this.library.refreshDocs();
    } finally {
      this.importing.set(false);
    }

    if (problems.length > 0) {
      const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : '';
      this.toast.error(problems[0] + more, 6000);
    }
    if (created.length === 1 && problems.length === 0) {
      this.toast.success('Document imported');
      await this.router.navigateByUrl(docPath(created[0]));
    } else if (created.length > 0) {
      this.toast.success(
        `Imported ${created.length} ${created.length === 1 ? 'document' : 'documents'}`,
      );
    }
  }

  async createFromTemplate(tpl: TemplateStarter): Promise<void> {
    try {
      const created = await this.docManager.createDoc(tpl.title, tpl.doc, {
        defaultPageSetup: true,
      });
      await this.library.refreshDocs();
      this.toast.success(`Created "${tpl.title}" from template`);
      await this.router.navigateByUrl(docPath(created.meta.id));
    } catch {
      this.toast.error('Failed to create template');
    }
  }

  async duplicateDoc(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    try {
      const dup = await this.docManager.duplicateDoc(id);
      await this.library.refreshDocs();
      this.toast.success('Document duplicated');
      await this.router.navigateByUrl(docPath(dup.meta.id));
    } catch {
      this.toast.error('Failed to duplicate document');
    }
  }

  async deleteDoc(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    await this.library.deleteDoc(id, event);
  }

  async shareDocLink(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    try {
      const doc = await this.docManager.getDoc(id);
      if (doc) {
        const meta = this.library.documents().find((d: DocMeta) => d.id === id);
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
