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
      expect(html).toContain('color: rgb(225, 29, 72)') || expect(html).toContain('color: #e11d48');

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
});

