import { StoredDoc } from '@inkframe-ui/editor/core';

export const WELCOME_DOC: StoredDoc = {
  schemaVersion: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Welcome to Inkframe ✦' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Inkframe is a modern, distraction-free document editor engineered with ' },
          {
            type: 'text',
            marks: [
              { type: 'textColor', attrs: { color: '#a855f7' } },
              { type: 'strong' },
            ],
            text: 'Angular',
          },
          { type: 'text', text: ' and ' },
          {
            type: 'text',
            marks: [
              { type: 'textColor', attrs: { color: '#3b82f6' } },
              { type: 'strong' },
            ],
            text: 'ProseMirror',
          },
          {
            type: 'text',
            text: '. It combines the flexibility of block-based editing with the fluid speed of pure typography. All your work is saved ',
          },
          { type: 'text', marks: [{ type: 'strong' }], text: 'offline in your browser' },
          { type: 'text', text: ' with zero telemetry or tracking.' },
        ],
      },
      {
        type: 'callout',
        attrs: { type: 'info' },
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', marks: [{ type: 'strong' }], text: '💡 Quick Tip: ' },
              { type: 'text', text: 'Press ' },
              { type: 'text', marks: [{ type: 'code' }], text: '/' },
              { type: 'text', text: ' on any empty line to open the ' },
              { type: 'text', marks: [{ type: 'strong' }], text: 'Slash Command Palette' },
              { type: 'text', text: ', or select text to reveal the contextual formatting bar.' },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Interactive Checklist' }],
      },
      {
        type: 'task_list',
        content: [
          {
            type: 'task_item',
            attrs: { checked: true },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Rich inline marks: ' },
                  { type: 'text', text: 'Test ' },
                  { type: 'text', marks: [{ type: 'strong' }], text: 'bold' },
                  { type: 'text', text: ', ' },
                  { type: 'text', marks: [{ type: 'em' }], text: 'italic' },
                  { type: 'text', text: ', ' },
                  { type: 'text', marks: [{ type: 'underline' }], text: 'underline' },
                  { type: 'text', text: ', ' },
                  { type: 'text', marks: [{ type: 'strikethrough' }], text: 'strikethrough' },
                  { type: 'text', text: ', and ' },
                  { type: 'text', marks: [{ type: 'code' }], text: 'inline code' },
                  { type: 'text', text: '.' },
                ],
              },
            ],
          },
          {
            type: 'task_item',
            attrs: { checked: true },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Floating action palette: ' },
                  { type: 'text', text: 'Highlight any text selection with your cursor or touch to style it instantly.' },
                ],
              },
            ],
          },
          {
            type: 'task_item',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Slash commands: ' },
                  { type: 'text', text: 'Type ' },
                  { type: 'text', marks: [{ type: 'code' }], text: '/table' },
                  { type: 'text', text: ', ' },
                  { type: 'text', marks: [{ type: 'code' }], text: '/callout' },
                  { type: 'text', text: ', or ' },
                  { type: 'text', marks: [{ type: 'code' }], text: '/code' },
                  { type: 'text', text: ' to embed structured blocks.' },
                ],
              },
            ],
          },
          {
            type: 'task_item',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Real-time Preview: ' },
                  { type: 'text', text: 'Switch to the ' },
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Preview' },
                  { type: 'text', text: ' tab in the top navbar to inspect clean, distraction-free reading.' },
                ],
              },
            ],
          },
          {
            type: 'task_item',
            attrs: { checked: false },
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Instant Sharing: ' },
                  { type: 'text', text: 'Click ' },
                  { type: 'text', marks: [{ type: 'strong' }], text: 'Share' },
                  { type: 'text', text: ' to copy a compressed zero-backend link containing the entire document.' },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Feature Matrix & Capabilities' }],
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
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Feature' }],
                  },
                ],
              },
              {
                type: 'table_header',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Capability' }],
                  },
                ],
              },
              {
                type: 'table_header',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Shortcut / Trigger' }],
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
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Command Palette' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Fast block insertion with keyboard search' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: '/ on empty line' }],
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
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Syntax Highlighting' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'One Dark theme, line numbers, and copy button' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: '``` or /code' }],
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
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Document History' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Named document management and auto-saves' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: 'History Drawer' }],
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
                    content: [{ type: 'text', marks: [{ type: 'strong' }], text: 'Universal Export' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Export to PDF, Word (.doc), Markdown, and HTML' }],
                  },
                ],
              },
              {
                type: 'table_cell',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', marks: [{ type: 'code' }], text: 'More Menu (···)' }],
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
        content: [{ type: 'text', text: 'Syntax-Highlighted Code Block' }],
      },
      {
        type: 'code_block',
        attrs: { language: 'typescript', wrap: false },
        content: [
          {
            type: 'text',
            text: `import { Component, signal, computed } from '@angular/core';

interface DocumentMeta {
  title: string;
  wordCount: number;
  offlineReady: boolean;
}

@Component({
  selector: 'ink-canvas',
  template: \`
    <main class="ink-doc">
      <h1>{{ doc().title }}</h1>
      <span class="badge">Offline: {{ doc().offlineReady ? 'YES' : 'NO' }}</span>
    </main>
  \`
})
export class CanvasComponent {
  readonly doc = signal<DocumentMeta>({
    title: 'Inkframe Document Canvas',
    wordCount: 420,
    offlineReady: true
  });
}`,
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
              { type: 'text', marks: [{ type: 'strong' }], text: '🚀 Local-First Architecture: ' },
              {
                type: 'text',
                text: 'No signups, no cloud lock-in. Everything you draft stays private in browser IndexedDB storage and works 100% offline.',
              },
            ],
          },
        ],
      },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'em' }],
                text: '“Simplicity is about subtracting the obvious and adding the meaningful.”',
              },
              {
                type: 'text',
                text: ' — John Maeda, ',
              },
              {
                type: 'text',
                marks: [{ type: 'em' }],
                text: 'The Laws of Simplicity',
              },
            ],
          },
        ],
      },
      {
        type: 'horizontal_rule',
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Essential Keyboard Shortcuts' }],
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + /' },
                  { type: 'text', text: ' or ' },
                  { type: 'text', marks: [{ type: 'code' }], text: '/' },
                  { type: 'text', text: ' — Open Slash Command menu' },
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + B' },
                  { type: 'text', text: ' / ' },
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + I' },
                  { type: 'text', text: ' / ' },
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + U' },
                  { type: 'text', text: ' — Bold, Italic, Underline' },
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + Alt + 1..3' },
                  { type: 'text', text: ' — Heading Level 1, 2, or 3' },
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + Alt + 0' },
                  { type: 'text', text: ' — Reset block to Paragraph' },
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + Z' },
                  { type: 'text', text: ' / ' },
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + Y' },
                  { type: 'text', text: ' — Undo / Redo' },
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
                  { type: 'text', marks: [{ type: 'code' }], text: 'Ctrl + S' },
                  { type: 'text', text: ' — Save changes & create revision record' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
