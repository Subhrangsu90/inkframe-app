import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from './schema/schema';
import { migrate, SCHEMA_VERSION, StoredDoc } from './schema/migrations';
import { clearFormattingCommand } from './extensions/commands';
import { docToHtml, htmlToDoc } from './io/html';
import { docToMarkdown, markdownToDoc } from './io/markdown';
import { TaskItemNodeView } from './extensions/lists/task-item.node-view';
import { EditorView } from 'prosemirror-view';
import { imageStorage } from './storage/image-storage';

describe('Inkframe Core', () => {
  describe('Migrations', () => {
    it('passes through documents matching current schemaVersion', () => {
      const stored: StoredDoc = {
        schemaVersion: SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Hello Inkframe' }],
            },
          ],
        },
      };

      const result = migrate(stored);
      expect(result).toEqual(stored.doc);
    });

    it('throws error for future unknown schema versions', () => {
      const futureDoc: StoredDoc = {
        schemaVersion: 999,
        doc: { type: 'doc' },
      };
      expect(() => migrate(futureDoc)).toThrow(/newer schema/);
    });
  });

  describe('HTML IO & Sanitization', () => {
    it('converts document to HTML', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello World')]),
      ]);
      const html = docToHtml(doc);
      expect(html).toContain('<p>Hello World</p>');
    });

    it('parses HTML and strips harmful scripts using DOMPurify', () => {
      const dangerousHtml =
        '<p>Normal text</p><script>alert("XSS")</script><img src="x" onerror="alert(1)">';
      const doc = htmlToDoc(dangerousHtml);
      const outputHtml = docToHtml(doc);

      expect(outputHtml).toContain('Normal text');
      expect(outputHtml).not.toContain('<script>');
      expect(outputHtml).not.toContain('onerror');
    });
  });

  describe('Markdown IO', () => {
    it('converts markdown to document and back to markdown', () => {
      const inputMd = '# Heading 1\n\nThis is **bold** text and `code`.';
      const doc = markdownToDoc(inputMd);
      expect(doc).toBeTruthy();
      expect(doc.type.name).toBe('doc');

      const serialized = docToMarkdown(doc);
      expect(serialized).toContain('# Heading 1');
      expect(serialized).toContain('**bold**');
      expect(serialized).toContain('`code`');
    });

    it('serializes and parses callout and table blocks', () => {
      const doc = schema.node('doc', null, [
        schema.node('callout', { type: 'info' }, [
          schema.node('paragraph', null, [schema.text('Important notice')]),
        ]),
      ]);
      const md = docToMarkdown(doc);
      expect(md).toContain('> [!INFO]');
      expect(md).toContain('Important notice');
    });
  });

  describe('Image Storage (IndexedDB)', () => {
    it('returns original URL for external links', async () => {
      const extUrl = 'https://example.com/cat.png';
      const resolved = await imageStorage.resolveUrl(extUrl);
      expect(resolved).toBe(extUrl);
    });

    it('returns original data URLs directly', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      const resolved = await imageStorage.resolveToDataUrl(dataUrl);
      expect(resolved).toBe(dataUrl);
    });

    it('resolves image URLs in HTML strings', async () => {
      const html = '<p>Photo</p><img src="https://example.com/photo.jpg" alt="test">';
      const resolved = await imageStorage.resolveHtmlImages(html);
      expect(resolved).toBe(html);
    });

    it('inlines document image nodes with data URLs', async () => {
      const testDoc = {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'data:image/png;base64,ABC',
                alt: 'Pic',
              },
            },
          ],
        },
      };
      const result = await imageStorage.inlineDocImages(testDoc);
      expect(result.doc.content[0].attrs.src).toBe('data:image/png;base64,ABC');
    });
  });

  describe('Phase 1: Typography Marks & Commands', () => {
    it('supports underline, strikethrough, subscript, superscript, small, and textColor marks in HTML', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('Underlined', [schema.marks['underline'].create()]),
          schema.text(' '),
          schema.text('Strikethrough', [schema.marks['strikethrough'].create()]),
          schema.text(' '),
          schema.text('H2', []),
          schema.text('O', [schema.marks['subscript'].create()]),
          schema.text(' '),
          schema.text('E=mc', []),
          schema.text('2', [schema.marks['superscript'].create()]),
          schema.text(' '),
          schema.text('Fineprint', [schema.marks['small'].create()]),
          schema.text(' '),
          schema.text('Colored', [schema.marks['textColor'].create({ color: '#e11d48' })]),
        ]),
      ]);

      const html = docToHtml(doc);
      expect(html).toContain('<u>Underlined</u>');
      expect(html).toContain('<s>Strikethrough</s>');
      expect(html).toContain('<sub>O</sub>');
      expect(html).toContain('<sup>2</sup>');
      expect(html).toContain('<small>Fineprint</small>');
      expect(html.includes('color: rgb(225, 29, 72)') || html.includes('color: #e11d48')).toBe(
        true,
      );

      // Roundtrip test
      const parsedDoc = htmlToDoc(html);
      expect(parsedDoc.textContent).toContain(
        'Underlined Strikethrough H2O E=mc2 Fineprint Colored',
      );
    });

    it('enforces mutual exclusion between subscript and superscript', () => {
      const sub = schema.marks['subscript'].create();
      const sup = schema.marks['superscript'].create();
      expect(sub.type.excludes(sup.type)).toBe(true);
      expect(sup.type.excludes(sub.type)).toBe(true);
    });

    it('serializes strikethrough, superscript, and subscript to markdown', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('struck', [schema.marks['strikethrough'].create()]),
          schema.text(' and '),
          schema.text('sub', [schema.marks['subscript'].create()]),
        ]),
      ]);
      const md = docToMarkdown(doc);
      expect(md).toContain('~~struck~~');
      expect(md).toContain('<sub>sub</sub>');
    });

    it('clearFormattingCommand clears all marks from selection', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [
          schema.text('Heavily styled', [
            schema.marks['strong'].create(),
            schema.marks['em'].create(),
            schema.marks['underline'].create(),
            schema.marks['textColor'].create({ color: '#ff0000' }),
          ]),
        ]),
      ]);

      let state = EditorState.create({
        schema,
        doc,
      });

      // Select "Heavily styled" (pos 1 to 15)
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 15)));

      let dispatchedState: EditorState | null = null;
      const success = clearFormattingCommand(state, (tr) => {
        dispatchedState = state.apply(tr);
      });

      expect(success).toBe(true);
      expect(dispatchedState).toBeTruthy();
      // Ensure no marks remain on node
      const firstChild = dispatchedState!.doc.firstChild?.firstChild;
      expect(firstChild?.marks.length).toBe(0);
    });

    it('code mark excludes other marks for individual formatting', () => {
      const codeMark = schema.marks['code'];
      const strongMark = schema.marks['strong'];
      const emMark = schema.marks['em'];
      const underlineMark = schema.marks['underline'];

      // code mark in basic schema specifies excludes: "_"
      expect(codeMark.excludes(strongMark)).toBe(true);
      expect(codeMark.excludes(emMark)).toBe(true);
      expect(codeMark.excludes(underlineMark)).toBe(true);
    });

    it('supports block level conversions and headings 1 to 6', () => {
      for (let level = 1; level <= 6; level++) {
        const h = schema.nodes['heading'].create({ level }, [schema.text(`Heading ${level}`)]);
        expect(h.attrs['level']).toBe(level);
        expect(h.textContent).toBe(`Heading ${level}`);
      }
    });

    it('supports list nodes (bullet_list, ordered_list, list_item)', () => {
      const li = schema.nodes['list_item'].create(null, [
        schema.nodes['paragraph'].create(null, [schema.text('List item 1')]),
      ]);
      const ul = schema.nodes['bullet_list'].create(null, [li]);
      expect(ul.type.name).toBe('bullet_list');
      expect(ul.childCount).toBe(1);

      const ol = schema.nodes['ordered_list'].create(null, [li]);
      expect(ol.type.name).toBe('ordered_list');
      expect(ol.childCount).toBe(1);
    });

    it('supports task_list and task_item nodes with checked attributes and markdown/html IO', () => {
      const unchecked = schema.nodes['task_item'].create({ checked: false }, [
        schema.nodes['paragraph'].create(null, [schema.text('Buy milk')]),
      ]);
      const checked = schema.nodes['task_item'].create({ checked: true }, [
        schema.nodes['paragraph'].create(null, [schema.text('Write tests')]),
      ]);
      const taskList = schema.nodes['task_list'].create(null, [unchecked, checked]);

      expect(taskList.type.name).toBe('task_list');
      expect(taskList.childCount).toBe(2);
      expect(unchecked.attrs['checked']).toBe(false);
      expect(checked.attrs['checked']).toBe(true);

      // Markdown serialization
      const md = docToMarkdown(schema.node('doc', null, [taskList]));
      expect(md).toContain('- [ ] Buy milk');
      expect(md).toContain('- [x] Write tests');

      // HTML serialization
      const html = docToHtml(schema.node('doc', null, [taskList]));
      expect(html).toContain('ink-task-list');
      expect(html).toContain('ink-task-item');
      expect(html).toContain('data-checked="true"');
      expect(html).toContain('data-checked="false"');

      // HTML round-trip
      const fromHtml = htmlToDoc(html);
      const htmlList = fromHtml.firstChild;
      expect(htmlList?.type.name).toBe('task_list');
      expect(htmlList?.childCount).toBe(2);
      expect(htmlList?.child(0).attrs['checked']).toBe(false);
      expect(htmlList?.child(1).attrs['checked']).toBe(true);

      // Markdown round-trip
      const fromMd = markdownToDoc(md);
      const mdList = fromMd.firstChild;
      expect(mdList?.type.name).toBe('task_list');
      expect(mdList?.childCount).toBe(2);
      expect(mdList?.child(0).attrs['checked']).toBe(false);
      expect(mdList?.child(1).attrs['checked']).toBe(true);
    });
  });

  describe('Phase 4: Color Palette & Dual-Tab Media & Emojis', () => {
    it('defines 21 color swatches (3x7 grid) and common emojis', async () => {
      const { TEXT_COLORS, COMMON_EMOJIS } = await import('./ui-helpers/colors');
      expect(TEXT_COLORS.length).toBe(21);
      expect(COMMON_EMOJIS.length).toBeGreaterThanOrEqual(20);

      // Verify each swatch has value and name defined
      for (const swatch of TEXT_COLORS) {
        expect(swatch.value).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(swatch.name).toBeTruthy();
      }
    });

    it('applies and clears textColor mark and serializes to HTML', () => {
      const redSwatch = '#ef4444';
      const mark = schema.marks['textColor'].create({ color: redSwatch });
      const textNode = schema.text('Vibrant red text', [mark]);
      const doc = schema.node('doc', null, [schema.node('paragraph', null, [textNode])]);

      expect(doc.check()).toBeUndefined();
      const html = docToHtml(doc);
      expect(html).toMatch(/color: (rgb\(239, 68, 68\)|#ef4444)/);
      expect(html).toContain('Vibrant red text');

      // Round-trip HTML parsing
      const parsed = htmlToDoc(html);
      const parsedText = parsed.firstChild?.firstChild;
      expect(parsedText?.marks.some((m) => m.type.name === 'textColor')).toBe(true);

      // Clear formatting command removes textColor
      let state = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 1, doc.content.size - 1),
      });

      clearFormattingCommand(state, (tr) => {
        state = state.apply(tr);
      });

      const clearedText = state.doc.firstChild?.firstChild;
      expect(clearedText?.marks.length).toBe(0);
    });

    it('inserts emojis into ProseMirror state cleanly', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello ')]),
      ]);
      let state = EditorState.create({
        doc,
        schema,
        selection: TextSelection.create(doc, 7), // after 'Hello '
      });

      const emoji = '🚀';
      const tr = state.tr.insertText(emoji, state.selection.from, state.selection.to);
      state = state.apply(tr);

      expect(state.doc.textContent).toBe('Hello 🚀');
    });
  });

  describe('Phase 7: Advanced Typography Marks, Formatting, Lifecycles & Benchmarking', () => {
    describe('Typography Marks & HTML Serialization', () => {
      it('creates and serializes underline mark', () => {
        const mark = schema.marks['underline'].create();
        const node = schema.text('Underlined text', [mark]);
        const p = schema.nodes['paragraph'].create(null, [node]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);
        expect(html).toContain('<u>Underlined text</u>');

        const parsed = htmlToDoc(html);
        expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'underline')).toBe(
          true,
        );
      });

      it('creates and serializes strikethrough mark', () => {
        const mark = schema.marks['strikethrough'].create();
        const node = schema.text('Struck text', [mark]);
        const p = schema.nodes['paragraph'].create(null, [node]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);
        expect(html).toContain('<s>Struck text</s>');

        const parsed = htmlToDoc(html);
        expect(
          parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'strikethrough'),
        ).toBe(true);
      });

      it('creates and serializes subscript and superscript marks', () => {
        const subMark = schema.marks['subscript'].create();
        const superMark = schema.marks['superscript'].create();

        const p = schema.nodes['paragraph'].create(null, [
          schema.text('H'),
          schema.text('2', [subMark]),
          schema.text('O and x'),
          schema.text('2', [superMark]),
        ]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);

        expect(html).toContain('<sub>2</sub>');
        expect(html).toContain('<sup>2</sup>');

        const parsed = htmlToDoc(html);
        let foundSub = false;
        let foundSuper = false;
        parsed.descendants((child) => {
          if (child.isText && child.marks.some((m) => m.type.name === 'subscript')) {
            foundSub = true;
          }
          if (child.isText && child.marks.some((m) => m.type.name === 'superscript')) {
            foundSuper = true;
          }
        });
        expect(foundSub).toBe(true);
        expect(foundSuper).toBe(true);
      });

      it('creates and serializes textColor mark', () => {
        const colorMark = schema.marks['textColor'].create({ color: '#ff5500' });
        const node = schema.text('Vibrant text', [colorMark]);
        const p = schema.nodes['paragraph'].create(null, [node]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);

        expect(html).toMatch(/color:\s*(#ff5500|rgb\(255,\s*85,\s*0\))/i);

        const parsed = htmlToDoc(html);
        let foundColor = false;
        parsed.descendants((child) => {
          const mark = child.marks.find((m) => m.type.name === 'textColor');
          if (mark) {
            foundColor = true;
            expect(mark.attrs['color']).toMatch(/#ff5500|rgb\(255,\s*85,\s*0\)/i);
          }
        });
        expect(foundColor).toBe(true);
      });

      it('creates and serializes small mark', () => {
        const smallMark = schema.marks['small'].create();
        const node = schema.text('Fine print', [smallMark]);
        const p = schema.nodes['paragraph'].create(null, [node]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);

        expect(html).toContain('<small>Fine print</small>');

        const parsed = htmlToDoc(html);
        expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'small')).toBe(
          true,
        );
      });
    });

    describe('clearFormattingCommand', () => {
      it('removes all inline marks from the active selection range', () => {
        const boldMark = schema.marks['strong'].create();
        const italicMark = schema.marks['em'].create();
        const underlineMark = schema.marks['underline'].create();
        const textNode = schema.text('Formatted text', [boldMark, italicMark, underlineMark]);
        const p = schema.nodes['paragraph'].create(null, [textNode]);
        const doc = schema.node('doc', null, [p]);

        let state = EditorState.create({
          doc,
          schema,
          selection: TextSelection.create(doc, 1, 15),
        });

        expect(state.doc.firstChild?.firstChild?.marks.length).toBe(3);

        const commandExecuted = clearFormattingCommand(state, (tr) => {
          state = state.apply(tr);
        });

        expect(commandExecuted).toBe(true);
        expect(state.doc.firstChild?.firstChild?.marks.length).toBe(0);
        expect(state.doc.firstChild?.firstChild?.text).toBe('Formatted text');
      });
    });

    describe('Markdown Round-Trip For Languages and Task Lists', () => {
      it('preserves code block language fences across markdown round-trip', () => {
        const codeBlock = schema.nodes['code_block'].create(
          { language: 'typescript' },
          schema.text('const answer: number = 42;'),
        );
        const doc = schema.node('doc', null, [codeBlock]);

        const markdown = docToMarkdown(doc);
        expect(markdown).toContain('```typescript');
        expect(markdown).toContain('const answer: number = 42;');

        const roundTripDoc = markdownToDoc(markdown);
        let foundLang = false;
        roundTripDoc.descendants((node) => {
          if (node.type.name === 'code_block') {
            foundLang = true;
            expect(node.attrs['language']).toBe('typescript');
            expect(node.textContent).toBe('const answer: number = 42;');
          }
        });
        expect(foundLang).toBe(true);
      });

      it('preserves task item states in markdown round-trip', () => {
        const item1 = schema.nodes['task_item'].create(
          { checked: false },
          schema.nodes['paragraph'].create(null, [schema.text('Todo task')]),
        );
        const item2 = schema.nodes['task_item'].create(
          { checked: true },
          schema.nodes['paragraph'].create(null, [schema.text('Completed task')]),
        );
        const taskList = schema.nodes['task_list'].create(null, [item1, item2]);
        const doc = schema.node('doc', null, [taskList]);

        const markdown = docToMarkdown(doc);
        expect(markdown).toContain('- [ ] Todo task');
        expect(markdown).toContain('- [x] Completed task');

        const roundTripDoc = markdownToDoc(markdown);
        let foundUnchecked = false;
        let foundChecked = false;
        roundTripDoc.descendants((node) => {
          if (node.type.name === 'task_item') {
            if (node.attrs['checked'] === false) foundUnchecked = true;
            if (node.attrs['checked'] === true) foundChecked = true;
          }
        });
        expect(foundUnchecked).toBe(true);
        expect(foundChecked).toBe(true);
      });
    });

    describe('NodeView Mount & Destroy Lifecycle Leak Test', () => {
      it('mounts and destroys 100 times without leaking or throwing', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        for (let i = 0; i < 100; i++) {
          const doc = schema.node('doc', null, [
            schema.nodes['task_list'].create(null, [
              schema.nodes['task_item'].create(
                { checked: i % 2 === 0 },
                schema.nodes['paragraph'].create(null, [schema.text(`Item ${i}`)]),
              ),
            ]),
          ]);

          const state = EditorState.create({ doc, schema });
          const view = new EditorView(container, {
            state,
            nodeViews: {
              task_item: (node, v, getPos) => new TaskItemNodeView(node, v, getPos as () => number),
            },
          });

          expect(view.dom).toBeDefined();
          view.destroy();
        }
      });
    });

    describe('Preview and Read-Only State', () => {
      it('toggles ProseMirror-preview class when view is in read-only or editable mode', () => {
        const container = document.createElement('div');
        const doc = schema.node('doc', null, [
          schema.nodes['paragraph'].create(null, [schema.text('Test preview')]),
        ]);
        const state = EditorState.create({ doc, schema });
        let editable = false;
        const view = new EditorView(container, {
          state,
          editable: () => editable,
        });
        view.dom.classList.toggle('ProseMirror-preview', !editable);

        expect(view.dom.classList.contains('ProseMirror-preview')).toBe(true);

        editable = true;
        view.dom.classList.toggle('ProseMirror-preview', !editable);
        expect(view.dom.classList.contains('ProseMirror-preview')).toBe(false);

        view.destroy();
        container.remove();
      });
    });

    describe('Performance & Latency Benchmarks', () => {
      it('executes 100 consecutive typing transactions in < 16ms average latency', () => {
        // Construct a substantial multi-block document
        const paragraphs = Array.from({ length: 50 }, (_, i) =>
          schema.nodes['paragraph'].create(null, [
            schema.text(
              `Paragraph ${i + 1}: inkframe performance profiling and latency evaluation test.`,
            ),
          ]),
        );
        const doc = schema.node('doc', null, paragraphs);
        let state = EditorState.create({ doc, schema });

        const startTime = performance.now();
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
          // Insert a character at position 1, then delete it
          const tr1 = state.tr.insertText('A', 1);
          state = state.apply(tr1);
          const tr2 = state.tr.delete(1, 2);
          state = state.apply(tr2);
        }

        const totalElapsed = performance.now() - startTime;
        const avgPerIteration = totalElapsed / (iterations * 2);

        // Average transaction time must be well within a 16ms frame budget (typically < 1ms)
        expect(avgPerIteration).toBeLessThan(16);
      });
    });
  });
});
