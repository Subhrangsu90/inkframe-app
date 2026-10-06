import {
  Component,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import {
  EditorComponent,
  StoredDoc,
  SCHEMA_VERSION,
  imageStorage,
  type StoredImageMetadata,
} from './editor';

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
          {
            type: 'table_row',
            content: [
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: 'Tab / Shift+Tab' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Navigate table cells / indent lists' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Tables / Lists' }],
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
            text: "// Angular 18+ Signal Integration\nconst isBold = signal(false);\nconst title = computed(() => `Status: ${isBold() ? 'Active' : 'Idle'}`);",
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
    ],
  },
};

@Component({
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatTabsModule,
    MatChipsModule,
    MatCardModule,
    EditorComponent,
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('Inkframe');
  protected readonly editable = signal(true);
  protected readonly currentDoc = signal<StoredDoc>(DEMO_DOC);
  protected readonly htmlOutput = signal('');
  protected readonly markdownOutput = signal('');
  protected readonly storedImages = signal<StoredImageMetadata[]>([]);
  protected readonly activeTab = signal(0);

  protected readonly editor = viewChild<EditorComponent>('inkEditor');

  protected readonly wordCount = computed(() => {
    const text = this.extractText(this.currentDoc().doc);
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  });

  protected readonly charCount = computed(() => {
    return this.extractText(this.currentDoc().doc).length;
  });

  protected readonly jsonString = computed(() => {
    return JSON.stringify(this.currentDoc(), null, 2);
  });

  constructor() {
    this.refreshImages();
  }

  protected onChanged(doc: StoredDoc): void {
    this.currentDoc.set(doc);
    this.updateOutputs();
  }

  protected updateOutputs(): void {
    const ed = this.editor();
    if (ed) {
      this.htmlOutput.set(ed.getHtml());
      this.markdownOutput.set(ed.getMarkdown());
    }
  }

  protected toggleEditable(): void {
    this.editable.update((v) => !v);
  }

  protected loadDemo(): void {
    this.editor()?.loadDoc(DEMO_DOC);
    this.currentDoc.set(DEMO_DOC);
    this.updateOutputs();
  }

  protected async refreshImages(): Promise<void> {
    const list = await imageStorage.listImages();
    this.storedImages.set(list);
  }

  protected async deleteImage(id: string): Promise<void> {
    await imageStorage.deleteImage(id);
    await this.refreshImages();
  }

  // ── Import / Export ─────────────────────────────────────────────
  protected exportMarkdown(): void {
    const md = this.editor()?.getMarkdown() || '';
    this.downloadFile(md, 'inkframe-document.md', 'text/markdown');
  }

  protected exportHtml(): void {
    const html = this.editor()?.getHtml() || '';
    this.downloadFile(html, 'inkframe-document.html', 'text/html');
  }

  protected exportJson(): void {
    const json = JSON.stringify(this.currentDoc(), null, 2);
    this.downloadFile(json, 'inkframe-document.json', 'application/json');
  }

  protected importMarkdown(): void {
    this.pickFile('.md,text/markdown', (content) => {
      this.editor()?.loadMarkdown(content);
      this.updateOutputs();
    });
  }

  protected importHtml(): void {
    this.pickFile('.html,text/html', (content) => {
      this.editor()?.loadHtml(content);
      this.updateOutputs();
    });
  }

  protected importJson(): void {
    this.pickFile('.json,application/json', (content) => {
      try {
        const parsed = JSON.parse(content) as StoredDoc;
        this.editor()?.loadDoc(parsed);
        this.updateOutputs();
      } catch (e) {
        alert('Invalid JSON file format.');
      }
    });
  }

  private pickFile(accept: string, onLoad: (content: string) => void): void {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => onLoad(reader.result as string);
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
