import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  EditorService,
  StoredDoc,
  SCHEMA_VERSION,
  docToHtml,
  htmlToDoc,
  docToMarkdown,
  markdownToDoc,
  EditorExtension,
  DEFAULT_EXTENSIONS,
} from '@inkframe-ui/editor/core';
import { Toolbar } from '@inkframe-ui/editor/toolbar';
import {
  FloatingMenu,
  SlashMenu,
  ImageLightbox,
  TableToolbar,
} from '@inkframe-ui/editor/extensions';

@Component({
  selector: 'ink-editor',
  encapsulation: ViewEncapsulation.None,
  imports: [
    Toolbar,
    FloatingMenu,
    SlashMenu,
    ImageLightbox,
    TableToolbar,
  ],
  providers: [EditorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-editor-wrapper" [class.is-preview]="!editable()">
      @if (showToolbar() && editable()) {
        <ink-toolbar />
      }
      <div #viewport class="ink-editor-viewport" (click)="onViewportClick($event)">
        <div class="ink-doc-page">
          <div #host class="ink-host" [class.ProseMirror-preview]="!editable()"></div>
        </div>
      </div>
      @if (editable()) {
        <ink-floating-menu />
        <ink-table-toolbar />
        <ink-slash-menu />
      }
      @if (svc.imagePreview(); as preview) {
        <ink-image-lightbox
          [src]="preview.src"
          [alt]="preview.alt"
          [title]="preview.title"
          (closed)="svc.closeImagePreview()"
        />
      }
    </div>
  `,
  styles: `
    /*
     * Height: set --ink-editor-height on <ink-editor> to size the editor, for
     * example 100% to fill a flex or grid cell. Without it the editor sizes
     * itself to the viewport.
     */
    .ink-editor-wrapper {
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 8px;
      overflow: hidden;
      background: var(--ink-bg-wrapper, #141518);
      height: var(--ink-editor-height, calc(100dvh - 128px));
      min-height: var(--ink-editor-min-height, 460px);
      display: flex;
      flex-direction: column;
      position: relative;
      transition: background-color 0.15s ease, border-color 0.15s ease;

      @media (min-width: 768px) {
        border-radius: 12px;
        height: var(--ink-editor-height, clamp(580px, 76vh, 900px));
      }

      &.is-preview {
        .ink-editor-viewport,
        .ink-host,
        .ProseMirror {
          cursor: default;
        }
        .ink-task-checkbox {
          cursor: default !important;
          pointer-events: none !important;
        }
        .callout-icon {
          cursor: default !important;
          pointer-events: none !important;
        }
        .ink-code-tool-btn.delete-btn {
          display: none !important;
        }
        .ink-lang-caret {
          display: none !important;
        }
        .ink-code-lang-btn {
          cursor: default !important;
          pointer-events: none !important;
        }
        .ink-code-lang-menu {
          display: none !important;
        }
        .ink-image-toolbar,
        .ink-image-resize-handle,
        .ink-image-size-badge {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
        }
        .ink-image-wrapper {
          outline: none !important;
        }
        img.ink-image,
        .ink-image {
          cursor: zoom-in !important;
          pointer-events: auto !important;
        }
        .ink-doc-page {
          &:focus-within {
            box-shadow: var(--ink-shadow-page, 0 2px 12px -2px rgba(0, 0, 0, 0.45));
            border-color: var(--ink-border-subtle, #282a30);
          }
        }
      }
    }
    .ink-editor-viewport {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      background: var(--ink-bg-app, #121316);
      padding: 8px 4px 32px;
      cursor: text;
      box-sizing: border-box;
      transition: background-color 0.15s ease;

      @media (min-width: 640px) {
        padding: 18px 14px 44px;
      }

      @media (min-width: 900px) {
        padding: 28px 20px 60px;
      }

      scrollbar-width: thin;
      scrollbar-color: var(--ink-scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent;

      &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: var(--ink-scrollbar-thumb, rgba(255, 255, 255, 0.16));
        border-radius: 4px;
        &:hover {
          background: var(--ink-scrollbar-thumb-hover, rgba(255, 255, 255, 0.28));
        }
      }
    }
    .ink-doc-page {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: var(--ink-bg-page, #18191c);
      border: 1px solid var(--ink-border-subtle, #282a30);
      border-radius: 6px;
      box-shadow: var(--ink-shadow-page, 0 2px 12px -2px rgba(0, 0, 0, 0.45));
      /* At least as tall as the visible canvas, whatever the screen size. */
      min-height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
      transition: box-shadow 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;

      @media (min-width: 768px) {
        border-radius: 8px;
      }

      &:focus-within {
        box-shadow: 0 6px 30px -2px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--ink-border-focus, rgba(96, 165, 250, 0.2));
      }
    }
    .ink-host {
      flex: 1 0 auto;
      display: flex;
      flex-direction: column;
      padding: 1.25rem 0.85rem 2.5rem;
      outline: none;
      box-sizing: border-box;
      cursor: text;

      @media (min-width: 640px) {
        padding: 2rem 1.75rem 3rem;
      }

      @media (min-width: 900px) {
        padding: 3rem 3.5rem 4rem;
      }
    }
    .ink-host :first-child {
      margin-top: 0;
    }
    /* Fills the page, so a click anywhere below the last line still focuses the editor. */
    .ink-host .ProseMirror {
      flex: 1 0 auto;
      min-height: 0;
      outline: none;
    }
  `,
})
export class Editor {
  protected readonly svc = inject(EditorService);
  private readonly zone = inject(NgZone);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setTimeout>;

  /** Read once at mount. Use loadDoc() to replace the document later. */
  readonly initialDoc = input<StoredDoc | null>(null);
  readonly editable = input(true);
  readonly debounceMs = input(300);
  readonly extensions = input<EditorExtension[]>(DEFAULT_EXTENSIONS);
  readonly showToolbar = input(true);
  readonly changed = output<StoredDoc>();
  readonly historyRequested = output<void>();

  constructor() {
    // afterNextRender runs only in the browser, so this is SSR-safe.
    afterNextRender(() => {
      this.svc.mount(this.host().nativeElement, {
        doc: this.initialDoc(),
        editable: this.editable(),
        extensions: this.extensions(),
        onChange: () => this.scheduleEmit(),
      });
      if (this.viewport()?.nativeElement) {
        this.viewport()!.nativeElement.scrollTop = 0;
      }

      // Emit pending edits when the tab is hidden or closed: browsers may
      // discard the page afterwards without running any destroy hooks.
      const doc = this.host().nativeElement.ownerDocument;
      const win = doc.defaultView;
      const onVisibilityChange = () => {
        if (doc.visibilityState === 'hidden') this.flush();
      };
      const onPageHide = () => this.flush();
      doc.addEventListener('visibilitychange', onVisibilityChange);
      win?.addEventListener('pagehide', onPageHide);
      this.destroyRef.onDestroy(() => {
        doc.removeEventListener('visibilitychange', onVisibilityChange);
        win?.removeEventListener('pagehide', onPageHide);
      });
    });

    effect(() => this.svc.setEditable(this.editable()));
    effect(() => this.svc.setExtensions(this.extensions()));

    effect(() => {
      const count = this.svc.openHistoryRequested();
      if (count > 0) {
        this.zone.run(() => this.historyRequested.emit());
      }
    });

    // Note: `changed` cannot be emitted from here. By the time destroy hooks
    // run, Angular has already removed the parent's (changed) listener, so
    // hosts must call flush() before the editor is destroyed (for example in
    // a canDeactivate guard). Pending edits are discarded otherwise.
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      this.svc.destroy();
    });
  }

  protected onViewportClick(event: MouseEvent): void {
    if (!this.editable()) return;
    const target = event.target as HTMLElement;
    if (
      target.classList.contains('ink-editor-viewport') ||
      target.classList.contains('ink-doc-page') ||
      target.classList.contains('ink-host')
    ) {
      this.svc.focus();
    }
  }

  // ── Public API ─────────────────────────────────────────────────
  /**
   * Replaces the document. Pending changes to the previous document are
   * emitted first, so they are not lost or reported as the new document's.
   */
  loadDoc(doc: StoredDoc) {
    this.flush();
    this.svc.setDoc(doc);
  }
  focus() {
    this.svc.focus();
  }
  blur() {
    this.svc.onFloatingMenu(null);
    this.svc.onSlashMenu(null);
    this.svc.onTableMenu?.(null);
  }
  getJSON(): StoredDoc {
    return this.svc.getJSON();
  }
  getHtml(): string {
    const v = this.svc.view;
    return v ? docToHtml(v.state.doc) : '';
  }
  getMarkdown(): string {
    const v = this.svc.view;
    return v ? docToMarkdown(v.state.doc) : '';
  }
  loadMarkdown(md: string): void {
    const doc = markdownToDoc(md);
    this.loadDoc({ schemaVersion: SCHEMA_VERSION, doc: doc.toJSON() });
  }
  loadHtml(html: string): void {
    const doc = htmlToDoc(html);
    this.loadDoc({ schemaVersion: SCHEMA_VERSION, doc: doc.toJSON() });
  }
  /**
   * Emits pending (debounced) changes immediately. Does nothing when there
   * are none. Call before switching the document the editor belongs to.
   */
  flush() {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.changed.emit(this.svc.getJSON());
  }

  private scheduleEmit() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.zone.run(() => this.changed.emit(this.svc.getJSON()));
    }, this.debounceMs());
  }
}

// Backward compatibility alias
export { Editor as EditorComponent };

