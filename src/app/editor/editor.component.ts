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
      <div #host class="ink-host"></div>
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
      border: 1px solid var(--mat-sys-outline-variant, #c4c7c5);
      border-radius: 12px;
      overflow: hidden;
      background: var(--mat-sys-surface, #fff);
    }
    .ink-host {
      min-height: 300px;
      padding: 1rem 1.25rem;
      outline: none;
    }
    .ink-host :first-child {
      margin-top: 0;
    }
  `,
})
export class EditorComponent {
  protected readonly svc = inject(EditorService);
  private readonly zone = inject(NgZone);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private timer?: ReturnType<typeof setTimeout>;

  /** Read once at mount. Use loadDoc() to replace the document later. */
  readonly initialDoc = input<StoredDoc | null>(null);
  readonly editable = input(true);
  readonly debounceMs = input(300);
  readonly changed = output<StoredDoc>();

  constructor() {
    // afterNextRender runs only in the browser, so this is SSR-safe.
    afterNextRender(() => {
      this.svc.mount(this.host().nativeElement, {
        doc: this.initialDoc(),
        editable: this.editable(),
        onChange: () => this.scheduleEmit(),
      });
    });

    effect(() => this.svc.setEditable(this.editable()));

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.svc.destroy();
    });
  }

  // ── Public API ─────────────────────────────────────────────────
  loadDoc(doc: StoredDoc) {
    this.svc.setDoc(doc);
  }
  focus() {
    this.svc.focus();
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
