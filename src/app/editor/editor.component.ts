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
} from '@angular/core';
import { EditorService } from './editor.service';
import { StoredDoc, SCHEMA_VERSION } from './core/migrations';
import { docToHtml, htmlToDoc } from './io/html';
import { docToMarkdown, markdownToDoc } from './io/markdown';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { FloatingMenuComponent } from './floating-menu/floating-menu.component';
import { SlashMenuComponent } from './slash-menu/slash-menu.component';
import { ImageLightboxComponent } from './image-lightbox/image-lightbox.component';
import { TableToolbarComponent } from './table-toolbar/table-toolbar.component';

@Component({
  selector: 'ink-editor',
  standalone: true,
  imports: [
    ToolbarComponent,
    FloatingMenuComponent,
    SlashMenuComponent,
    ImageLightboxComponent,
    TableToolbarComponent,
  ],
  providers: [EditorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ink-editor-wrapper">
      <ink-toolbar />
      <div #viewport class="ink-editor-viewport" (click)="onViewportClick($event)">
        <div class="ink-doc-page">
          <div #host class="ink-host"></div>
        </div>
      </div>
      <ink-floating-menu />
      <ink-table-toolbar />
      <ink-slash-menu />
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
    .ink-editor-wrapper {
      border: 1px solid var(--ink-border-default, #2e3036);
      border-radius: 8px;
      overflow: hidden;
      background: var(--ink-bg-wrapper, #141518);
      height: calc(100dvh - 128px);
      min-height: 460px;
      display: flex;
      flex-direction: column;
      position: relative;
      transition: background-color 0.15s ease, border-color 0.15s ease;

      @media (min-width: 768px) {
        border-radius: 12px;
        height: clamp(580px, 76vh, 900px);
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
      min-height: calc(100dvh - 180px);
      height: auto;
      overflow: hidden;
      box-sizing: border-box;
      transition: box-shadow 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;

      @media (min-width: 768px) {
        border-radius: 8px;
        min-height: 880px;
      }

      &:focus-within {
        box-shadow: 0 6px 30px -2px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--ink-border-focus, rgba(96, 165, 250, 0.2));
      }
    }
    .ink-host {
      padding: 1.25rem 0.85rem 2.5rem;
      outline: none;
      min-height: calc(100dvh - 200px);
      box-sizing: border-box;
      cursor: text;

      @media (min-width: 640px) {
        padding: 2rem 1.75rem 3rem;
      }

      @media (min-width: 900px) {
        padding: 3rem 3.5rem 4rem;
        min-height: 880px;
      }
    }
    .ink-host :first-child {
      margin-top: 0;
    }
    .ink-host .ProseMirror {
      min-height: calc(100dvh - 220px);
      outline: none;

      @media (min-width: 768px) {
        min-height: 760px;
      }
    }
  `,
})
export class EditorComponent {
  protected readonly svc = inject(EditorService);
  private readonly zone = inject(NgZone);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private timer?: ReturnType<typeof setTimeout>;

  /** Read once at mount. Use loadDoc() to replace the document later. */
  readonly initialDoc = input<StoredDoc | null>(null);
  readonly editable = input(true);
  readonly debounceMs = input(300);
  readonly changed = output<StoredDoc>();
  readonly historyRequested = output<void>();

  constructor() {
    // afterNextRender runs only in the browser, so this is SSR-safe.
    afterNextRender(() => {
      this.svc.mount(this.host().nativeElement, {
        doc: this.initialDoc(),
        editable: this.editable(),
        onChange: () => this.scheduleEmit(),
      });
      if (this.viewport()?.nativeElement) {
        this.viewport()!.nativeElement.scrollTop = 0;
      }
    });

    effect(() => this.svc.setEditable(this.editable()));

    effect(() => {
      const count = this.svc.openHistoryRequested();
      if (count > 0) {
        this.zone.run(() => this.historyRequested.emit());
      }
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.svc.destroy();
    });
  }

  protected onViewportClick(event: MouseEvent): void {
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
  loadDoc(doc: StoredDoc) {
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
    this.svc.setDoc({ schemaVersion: SCHEMA_VERSION, doc: doc.toJSON() });
  }
  loadHtml(html: string): void {
    const doc = htmlToDoc(html);
    this.svc.setDoc({ schemaVersion: SCHEMA_VERSION, doc: doc.toJSON() });
  }
  /** Emit pending changes immediately (call before navigating away). */
  flush() {
    clearTimeout(this.timer);
    this.changed.emit(this.svc.getJSON());
  }

  private scheduleEmit() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.zone.run(() => this.changed.emit(this.svc.getJSON())),
      this.debounceMs(),
    );
  }
}
