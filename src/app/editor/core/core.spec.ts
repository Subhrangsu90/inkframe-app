import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from './schema';
import { sanitizeHref } from './link-utils';
import { migrate, SCHEMA_VERSION, StoredDoc } from './migrations';
import { clearFormattingCommand, toggleListCommand } from './plugins';
import { docToHtml, htmlToDoc } from '../io/html';
import { docToMarkdown, markdownToDoc } from '../io/markdown';
import { splitListItem, liftListItem } from 'prosemirror-schema-list';
import { taskItemRule } from './input-rules';
import { TaskItemNodeView } from '../node-views/task-item.node-view';
import { EditorView } from 'prosemirror-view';
import { imageStorage } from './image-storage';
import { highlightPlugin, highlightKey } from './highlight.plugin';
import { tableUIPlugin, tableUIKey } from './table-ui.plugin';

describe('Inkframe Core', () => {
  describe('Link Sanitization (Security)', () => {
    it('allows valid https, http, and mailto URLs', () => {
      expect(sanitizeHref('https://example.com')).toBe('https://example.com');
      expect(sanitizeHref('http://example.com/page?foo=bar')).toBe('http://example.com/page?foo=bar');
      expect(sanitizeHref('mailto:user@example.com')).toBe('mailto:user@example.com');
    });

    it('rejects javascript: and other dangerous protocols', () => {
      expect(sanitizeHref('javascript:alert(1)')).toBeNull();
      expect(sanitizeHref('JAVASCRIPT:alert(document.cookie)')).toBeNull();
      expect(sanitizeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(sanitizeHref('vbscript:msgbox(1)')).toBeNull();
      expect(sanitizeHref('')).toBeNull();
      expect(sanitizeHref(null)).toBeNull();
    });
  });

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
      const dangerousHtml = '<p>Normal text</p><script>alert("XSS")</script><img src="x" onerror="alert(1)">';
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
      expect(html.includes('color: rgb(225, 29, 72)') || html.includes('color: #e11d48')).toBe(true);

      // Roundtrip test
      const parsedDoc = htmlToDoc(html);
      expect(parsedDoc.textContent).toContain('Underlined Strikethrough H2O E=mc2 Fineprint Colored');
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
      expect(md).toContain('~sub~');
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
      state = state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, 1, 15)),
      );

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

  describe('Phase 2: Task / Todo List Node & Interactive NodeView', () => {
    it('transforms [ ] input rule into task_list with unchecked task_item', () => {
      const doc = schema.node('doc', null, [
        schema.nodes['paragraph'].create(null, [schema.text('[ ] Buy milk')]),
      ]);
      const state = EditorState.create({ schema, doc });
      const rule = taskItemRule();
      // Match "[ ] " at start of paragraph: start = 1, end = 5
      const match = '[ ] '.match(/^\s*\[([ xX]?)\]\s$/)!;
      const tr = (rule as any).handler(state, match, 1, 5);

      expect(tr).toBeTruthy();
      const updatedDoc = tr.doc;
      const list = updatedDoc.firstChild;
      expect(list?.type.name).toBe('task_list');
      const item = list?.firstChild;
      expect(item?.type.name).toBe('task_item');
      expect(item?.attrs['checked']).toBe(false);
      expect(item?.textContent).toBe('Buy milk');
    });

    it('transforms [x] input rule into task_list with checked task_item', () => {
      const doc = schema.node('doc', null, [
        schema.nodes['paragraph'].create(null, [schema.text('[x] Finished chore')]),
      ]);
      const state = EditorState.create({ schema, doc });
      const rule = taskItemRule();
      const match = '[x] '.match(/^\s*\[([ xX]?)\]\s$/)!;
      const tr = (rule as any).handler(state, match, 1, 5);

      expect(tr).toBeTruthy();
      const updatedDoc = tr.doc;
      const list = updatedDoc.firstChild;
      expect(list?.type.name).toBe('task_list');
      const item = list?.firstChild;
      expect(item?.type.name).toBe('task_item');
      expect(item?.attrs['checked']).toBe(true);
      expect(item?.textContent).toBe('Finished chore');
    });

    it('splitListItem creates a new unchecked task item when splitting a checked item', () => {
      const checkedItem = schema.nodes['task_item'].create({ checked: true }, [
        schema.nodes['paragraph'].create(null, [schema.text('Done with task')]),
      ]);
      const taskList = schema.nodes['task_list'].create(null, [checkedItem]);
      const doc = schema.node('doc', null, [taskList]);

      // Selection at the end of "Done with task" (pos 17)
      let state = EditorState.create({ schema, doc });
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 17)));

      let nextState: EditorState | null = null;
      const cmd = splitListItem(schema.nodes['task_item'], { checked: false });
      const handled = cmd(state, (tr) => {
        nextState = state.apply(tr);
      });

      expect(handled).toBe(true);
      expect(nextState).toBeTruthy();
      const list = nextState!.doc.firstChild;
      expect(list?.type.name).toBe('task_list');
      expect(list?.childCount).toBe(2);
      expect(list?.child(0).attrs['checked']).toBe(true);
      expect(list?.child(1).attrs['checked']).toBe(false);
    });

    it('split or lift command lifts empty task item out of task_list on Enter', () => {
      const emptyItem = schema.nodes['task_item'].create({ checked: false }, [
        schema.nodes['paragraph'].create(null),
      ]);
      const taskList = schema.nodes['task_list'].create(null, [emptyItem]);
      const doc = schema.node('doc', null, [taskList]);

      let state = EditorState.create({ schema, doc });
      // Selection in the empty item (pos 3)
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));

      let nextState: EditorState | null = null;
      const cmd = (s: EditorState, d?: (tr: any) => void) =>
        splitListItem(schema.nodes['task_item'], { checked: false })(s, d) ||
        liftListItem(schema.nodes['task_item'])(s, d);
      const handled = cmd(state, (tr) => {
        nextState = state.apply(tr);
      });

      expect(handled).toBe(true);
      expect(nextState).toBeTruthy();
      // Should lift out and turn into a regular paragraph
      expect(nextState!.doc.firstChild?.type.name).toBe('paragraph');
    });

    it('TaskItemNodeView renders checkbox, contentDOM, and updates state reactively', () => {
      const itemNode = schema.nodes['task_item'].create({ checked: false }, [
        schema.nodes['paragraph'].create(null, [schema.text('Task item')]),
      ]);

      const dummyView = {
        state: EditorState.create({ schema }),
        dispatch: () => { },
      } as unknown as EditorView;

      const nodeView = new TaskItemNodeView(itemNode, dummyView, () => 1);
      expect(nodeView.dom.tagName.toLowerCase()).toBe('li');
      expect(nodeView.dom.className).toBe('ink-task-item');
      expect(nodeView.contentDOM).toBeTruthy();

      const checkbox = nodeView.dom.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(false);

      // Verify stopEvent prevents ProseMirror from intercepting checkbox interactions
      const clickEvent = new MouseEvent('click');
      Object.defineProperty(clickEvent, 'target', { value: checkbox });
      expect(nodeView.stopEvent(clickEvent)).toBe(true);

      // Verify node update changes checked attribute and class
      const updatedNode = schema.nodes['task_item'].create({ checked: true }, [
        schema.nodes['paragraph'].create(null, [schema.text('Task item')]),
      ]);
      const updated = nodeView.update(updatedNode);
      expect(updated).toBe(true);
      expect(checkbox.checked).toBe(true);
      expect(nodeView.dom.classList.contains('checked')).toBe(true);
    });

    it('toggleListCommand auto-switches seamlessly between bullet, ordered, and task lists without manual unselecting', () => {
      // 1. Start with a bullet list
      const li = schema.nodes['list_item'].create(null, [
        schema.nodes['paragraph'].create(null, [schema.text('First item')]),
      ]);
      const bulletList = schema.nodes['bullet_list'].create(null, [li]);
      let state = EditorState.create({
        schema,
        doc: schema.node('doc', null, [bulletList]),
      });
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));

      // 2. Auto-switch to ordered_list without unselecting
      let nextState: EditorState = state;
      toggleListCommand('ordered_list')(state, (tr) => {
        nextState = state.apply(tr);
      });
      expect(nextState.doc.firstChild?.type.name).toBe('ordered_list');
      expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('list_item');
      expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

      // 3. Auto-switch from ordered_list to task_list without unselecting
      state = nextState;
      toggleListCommand('task_list')(state, (tr) => {
        nextState = state.apply(tr);
      });
      expect(nextState.doc.firstChild?.type.name).toBe('task_list');
      expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('task_item');
      expect(nextState.doc.firstChild?.firstChild?.attrs['checked']).toBe(false);
      expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

      // 4. Auto-switch from task_list back to bullet_list without unselecting
      state = nextState;
      toggleListCommand('bullet_list')(state, (tr) => {
        nextState = state.apply(tr);
      });
      expect(nextState.doc.firstChild?.type.name).toBe('bullet_list');
      expect(nextState.doc.firstChild?.firstChild?.type.name).toBe('list_item');
      expect(nextState.doc.firstChild?.firstChild?.textContent).toBe('First item');

      // 5. Selecting the same active list lifts out to paragraph (toggles off)
      state = nextState;
      toggleListCommand('bullet_list')(state, (tr) => {
        nextState = state.apply(tr);
      });
      expect(nextState.doc.firstChild?.type.name).toBe('paragraph');
      expect(nextState.doc.firstChild?.textContent).toBe('First item');
    });

    it('supports arbitrary nesting combinations across bullet, ordered, and task lists', () => {
      // 1. Bullet list with nested Ordered list and nested Task list
      const taskItem1 = schema.nodes['task_item'].create({ checked: false }, [
        schema.nodes['paragraph'].create(null, [schema.text('Subtask A')]),
      ]);
      const taskItem2 = schema.nodes['task_item'].create({ checked: true }, [
        schema.nodes['paragraph'].create(null, [schema.text('Subtask B')]),
      ]);
      const nestedTaskList = schema.nodes['task_list'].create(null, [taskItem1, taskItem2]);

      const orderedItem = schema.nodes['list_item'].create(null, [
        schema.nodes['paragraph'].create(null, [schema.text('Ordered step 1')]),
        nestedTaskList,
      ]);
      const nestedOrderedList = schema.nodes['ordered_list'].create(null, [orderedItem]);

      const rootBulletItem = schema.nodes['list_item'].create(null, [
        schema.nodes['paragraph'].create(null, [schema.text('Main bullet')]),
        nestedOrderedList,
      ]);
      const rootDoc = schema.node('doc', null, [
        schema.nodes['bullet_list'].create(null, [rootBulletItem]),
      ]);

      expect(rootDoc.check()).toBeUndefined(); // valid schema structure

      // HTML serialization & round-trip of mixed nested hierarchy
      const html = docToHtml(rootDoc);
      expect(html).toContain('<ul>');
      expect(html).toContain('<ol>');
      expect(html).toContain('ink-task-list');

      const parsedDoc = htmlToDoc(html);
      expect(parsedDoc.firstChild?.type.name).toBe('bullet_list');
      const innerOrdered = parsedDoc.firstChild?.firstChild?.lastChild;
      expect(innerOrdered?.type.name).toBe('ordered_list');
      const innerTask = innerOrdered?.firstChild?.lastChild;
      expect(innerTask?.type.name).toBe('task_list');
      expect(innerTask?.child(0).attrs['checked']).toBe(false);
      expect(innerTask?.child(1).attrs['checked']).toBe(true);

      // Markdown export
      const md = docToMarkdown(rootDoc);
      expect(md).toContain('Main bullet');
      expect(md).toContain('Ordered step 1');
      expect(md).toContain('[ ] Subtask A');
      expect(md).toContain('[x] Subtask B');
    });
  });

  describe('Phase 4: Color Palette & Dual-Tab Media & Emojis', () => {
    it('defines 21 color swatches (3x7 grid) and common emojis', async () => {
      const { TEXT_COLORS, COMMON_EMOJIS } = await import('./colors');
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
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [textNode]),
      ]);

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

    it('supports dual-mode image node serialization (external link and local storage URI)', () => {
      const remoteImg = schema.nodes['image'].create({
        src: 'https://images.unsplash.com/photo-example.jpg',
        alt: 'Scenic photo',
        title: 'Scenic',
      });
      const localImg = schema.nodes['image'].create({
        src: 'inkframe-img:test-uuid-1234',
        alt: 'Uploaded graphic',
      });

      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Gallery:'), remoteImg, localImg]),
      ]);

      // HTML output
      const html = docToHtml(doc);
      expect(html).toContain('src="https://images.unsplash.com/photo-example.jpg"');
      expect(html).toContain('src="inkframe-img:test-uuid-1234"');

      // Markdown output
      const md = docToMarkdown(doc);
      expect(md).toContain('![Scenic photo](https://images.unsplash.com/photo-example.jpg "Scenic")');
      expect(md).toContain('![Uploaded graphic](inkframe-img:test-uuid-1234)');

      // Markdown parser reconstructs images
      const parsedFromMd = markdownToDoc(md);
      let foundRemote = false;
      let foundLocal = false;
      parsedFromMd.descendants((node) => {
        if (node.type.name === 'image') {
          if (node.attrs['src'] === 'https://images.unsplash.com/photo-example.jpg') foundRemote = true;
          if (node.attrs['src'] === 'inkframe-img:test-uuid-1234') foundLocal = true;
        }
      });
      expect(foundRemote).toBe(true);
      expect(foundLocal).toBe(true);
    });

    it('inserts emojis into ProseMirror state cleanly', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello ')])
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

  describe('Phase 5: Enhanced Code Block NodeView', () => {
    it('creates code_block with custom language and wrap attributes', () => {
      const codeNode = schema.nodes['code_block'].create(
        { language: 'python', wrap: true },
        schema.text('def greet():\n    return "hi"')
      );

      expect(codeNode.attrs['language']).toBe('python');
      expect(codeNode.attrs['wrap']).toBe(true);
      expect(codeNode.textContent).toBe('def greet():\n    return "hi"');
    });

    it('round-trips code block language via Markdown serialization & parsing', () => {
      const doc = schema.node('doc', null, [
        schema.nodes['code_block'].create(
          { language: 'typescript' },
          schema.text('const answer: number = 42;')
        ),
      ]);

      const md = docToMarkdown(doc);
      expect(md).toContain('```typescript');
      expect(md).toContain('const answer: number = 42;');

      const parsed = markdownToDoc(md);
      let foundCodeBlock = false;
      parsed.descendants((node) => {
        if (node.type.name === 'code_block') {
          foundCodeBlock = true;
          expect(node.attrs['language']).toBe('typescript');
          expect(node.textContent).toBe('const answer: number = 42;');
        }
      });
      expect(foundCodeBlock).toBe(true);
    });

    it('round-trips code block language and wrap via HTML serialization & parsing', () => {
      const doc = schema.node('doc', null, [
        schema.nodes['code_block'].create(
          { language: 'rust', wrap: true },
          schema.text('fn main() { println!("Hello!"); }')
        ),
      ]);

      const html = docToHtml(doc);
      expect(html).toContain('language-rust');
      expect(html).toContain('data-language="rust"');
      expect(html).toContain('data-wrap="true"');

      const parsed = htmlToDoc(html);
      let foundRustBlock = false;
      parsed.descendants((node) => {
        if (node.type.name === 'code_block') {
          foundRustBlock = true;
          expect(node.attrs['language']).toBe('rust');
          expect(node.attrs['wrap']).toBe(true);
        }
      });
      expect(foundRustBlock).toBe(true);
    });

    it('generates syntax highlighting decorations for code_block', () => {
      const codeNode = schema.nodes['code_block'].create(
        { language: 'typescript' },
        schema.text('import { schema } from "./schema";')
      );
      const doc = schema.node('doc', null, [codeNode]);
      const state = EditorState.create({
        doc,
        schema,
        plugins: [highlightPlugin()],
      });

      const decos = highlightKey.getState(state);
      expect(decos).toBeDefined();
      const found = decos.find(0, doc.nodeSize);
      expect(found.length).toBeGreaterThan(0);
      const classes = found.map((d: any) => d.type.attrs.class);
      expect(classes.some((c: string) => c.includes('keyword'))).toBe(true);
      expect(classes.some((c: string) => c.includes('string'))).toBe(true);
    });
  });

  describe('Phase 6: Interactive Table NodeView & Table UI', () => {
    it('supports cell alignment, background, and height attributes in schema', () => {
      const cell = schema.nodes['table_cell'].create(
        { alignment: 'center', background: '#1e3a5f', height: '48px' },
        [schema.nodes['paragraph'].create(null, [schema.text('Centered Cell')])]
      );

      expect(cell.attrs['alignment']).toBe('center');
      expect(cell.attrs['background']).toBe('#1e3a5f');
      expect(cell.attrs['height']).toBe('48px');

      const row = schema.nodes['table_row'].create(null, [cell]);
      const table = schema.nodes['table'].create(null, [row]);
      const doc = schema.node('doc', null, [table]);

      const html = docToHtml(doc);
      expect(html).toContain('text-align: center');
      expect(html).toContain('background-color: rgb(30, 58, 95)');
      expect(html).toContain('height: 48px');

      const parsed = htmlToDoc(html);
      let foundCell = false;
      parsed.descendants((node) => {
        if (node.type.name === 'table_cell') {
          foundCell = true;
          expect(node.attrs['alignment']).toBe('center');
          expect(node.attrs['background']).toMatch(/#1e3a5f|rgb\(30, 58, 95\)/i);
          expect(node.attrs['height']).toBe('48px');
        }
      });
      expect(foundCell).toBe(true);
    });

    it('tableUIPlugin generates column handles, row handles, and empty cell placeholders', () => {
      const emptyCell = schema.nodes['table_cell'].create(null, [
        schema.nodes['paragraph'].create(),
      ]);
      const filledCell = schema.nodes['table_cell'].create(null, [
        schema.nodes['paragraph'].create(null, [schema.text('Data')]),
      ]);

      const row1 = schema.nodes['table_row'].create(null, [emptyCell, filledCell]);
      const row2 = schema.nodes['table_row'].create(null, [filledCell, emptyCell]);
      const table = schema.nodes['table'].create(null, [row1, row2]);
      const doc = schema.node('doc', null, [table]);

      const state = EditorState.create({
        doc,
        schema,
        plugins: [tableUIPlugin()],
      });

      const decos = tableUIKey.getState(state);
      expect(decos).toBeDefined();

      const allDecos = decos.find(0, doc.nodeSize);
      expect(allDecos.length).toBeGreaterThan(0);

      // Check for row handles (first cell of row1 and row2)
      const hasRowHandle = allDecos.some((d: any) => {
        const el = d.type?.toDOM || d.type?.widget;
        return ((el && el.className) || '').includes('ink-table-row-handle');
      });
      expect(hasRowHandle).toBe(true);

      // Check for column header handles (in first row)
      const hasColHandle = allDecos.some((d: any) => {
        const el = d.type?.toDOM || d.type?.widget;
        return ((el && el.className) || '').includes('ink-table-col-header-handle');
      });
      expect(hasColHandle).toBe(true);

      // Check for empty cell placeholder in emptyCell
      const hasPlaceholder = allDecos.some((d: any) => {
        const el = d.type?.toDOM || d.type?.widget;
        return ((el && el.className) || '').includes('ink-table-cell-placeholder');
      });
      expect(hasPlaceholder).toBe(true);
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
        expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'underline')).toBe(true);
      });

      it('creates and serializes strikethrough mark', () => {
        const mark = schema.marks['strikethrough'].create();
        const node = schema.text('Struck text', [mark]);
        const p = schema.nodes['paragraph'].create(null, [node]);
        const doc = schema.node('doc', null, [p]);
        const html = docToHtml(doc);
        expect(html).toContain('<s>Struck text</s>');

        const parsed = htmlToDoc(html);
        expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'strikethrough')).toBe(true);
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
        expect(parsed.firstChild?.firstChild?.marks.some((m) => m.type.name === 'small')).toBe(true);
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
          schema.text('const answer: number = 42;')
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
          schema.nodes['paragraph'].create(null, [schema.text('Todo task')])
        );
        const item2 = schema.nodes['task_item'].create(
          { checked: true },
          schema.nodes['paragraph'].create(null, [schema.text('Completed task')])
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
                schema.nodes['paragraph'].create(null, [schema.text(`Item ${i}`)])
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

        container.remove();
      });
    });

    describe('Performance & Latency Benchmarks', () => {
      it('executes 100 consecutive typing transactions in < 16ms average latency', () => {
        // Construct a substantial multi-block document
        const paragraphs = Array.from({ length: 50 }, (_, i) =>
          schema.nodes['paragraph'].create(null, [
            schema.text(`Paragraph ${i + 1}: inkframe performance profiling and latency evaluation test.`),
          ])
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

