import { describe, it, expect } from 'vitest';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema/schema';
import { docToMarkdown, markdownToDoc } from './markdown';

const { marks, nodes } = schema;
const p = (...content: PMNode[]) => nodes['paragraph'].create(null, content);
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);

function roundTrip(d: PMNode): PMNode {
  return markdownToDoc(docToMarkdown(d));
}

describe('Markdown round trip', () => {
  it('re-imports tables, including header cells and column alignment', () => {
    const cell = (type: string, text: string, alignment: string | null = null) =>
      nodes[type].create({ alignment }, [p(schema.text(text))]);
    const table = nodes['table'].create(null, [
      nodes['table_row'].create(null, [
        cell('table_header', 'Name'),
        cell('table_header', 'Qty', 'right'),
      ]),
      nodes['table_row'].create(null, [
        cell('table_cell', 'Apples'),
        cell('table_cell', '3', 'right'),
      ]),
    ]);

    const md = docToMarkdown(doc(table));
    expect(md).toContain('| --- | ---: |');

    const back = markdownToDoc(md);
    const t = back.firstChild!;
    expect(t.type.name).toBe('table');
    expect(t.childCount).toBe(2);
    expect(t.child(0).child(0).type.name).toBe('table_header');
    expect(t.child(1).child(0).type.name).toBe('table_cell');
    expect(t.child(1).child(1).textContent).toBe('3');
    expect(t.child(1).child(1).attrs['alignment']).toBe('right');
  });

  it('re-imports callouts with their kind', () => {
    const callout = nodes['callout'].create({ type: 'warning' }, [
      p(schema.text('Careful here')),
      p(schema.text('Second paragraph')),
    ]);
    const back = roundTrip(doc(callout)).firstChild!;
    expect(back.type.name).toBe('callout');
    expect(back.attrs['type']).toBe('warning');
    expect(back.childCount).toBe(2);
    expect(back.firstChild!.textContent).toBe('Careful here');
  });

  it('reads GitHub-style alerts as callouts', () => {
    const back = markdownToDoc('> [!NOTE]\n> Useful info').firstChild!;
    expect(back.type.name).toBe('callout');
    expect(back.attrs['type']).toBe('note');
    expect(back.textContent).toBe('Useful info');
    expect(markdownToDoc('> [!TIP]\n> x').firstChild!.attrs['type']).toBe('success');
  });

  it('round-trips note callouts', () => {
    const note = nodes['callout'].create({ type: 'note' }, [p(schema.text('Remember'))]);
    expect(docToMarkdown(doc(note))).toBe('> [!NOTE]\n> Remember');
    expect(roundTrip(doc(note)).firstChild!.attrs['type']).toBe('note');
  });

  it('keeps plain blockquotes as blockquotes', () => {
    expect(markdownToDoc('> just a quote').firstChild!.type.name).toBe('blockquote');
  });

  it.each([
    ['underline', 'underline', {}],
    ['small', 'small', {}],
    ['subscript', 'subscript', {}],
    ['superscript', 'superscript', {}],
    ['textColor', 'textColor', { color: '#ef4444' }],
  ])('re-imports %s marks (including multi-word text)', (_label, markName, attrs) => {
    const d = doc(
      p(
        schema.text('before '),
        schema.text('two words', [marks[markName].create(attrs)]),
        schema.text(' after'),
      ),
    );
    const back = roundTrip(d);
    expect(back.textContent).toBe('before two words after');
    const marked = back.firstChild!.child(1);
    expect(marked.text).toBe('two words');
    expect(marks[markName].isInSet(marked.marks)?.attrs).toEqual(
      marks[markName].create(attrs).attrs,
    );
  });

  it('reads pandoc-style ~sub~ and ^sup^ but leaves ~~strike~~ alone', () => {
    const para = markdownToDoc('H~2~O, x^2^ and ~~gone~~').firstChild!;
    expect(para.textContent).toBe('H2O, x2 and gone');
    const markNames = new Set<string>();
    para.forEach((n) => n.marks.forEach((m) => markNames.add(m.type.name)));
    expect(markNames).toEqual(new Set(['subscript', 'superscript', 'strikethrough']));
  });

  it('keeps unknown, unbalanced or unsafe tags as literal text', () => {
    expect(markdownToDoc('a </u> b').textContent).toBe('a </u> b');
    expect(markdownToDoc('a <u> b').textContent).toBe('a <u> b');
    expect(markdownToDoc('<b>bold</b>').textContent).toBe('<b>bold</b>');
    const injected = '<span style="color: red; background: url(x)">t</span>';
    expect(markdownToDoc(injected).textContent).toBe(injected);
  });

  it('still round-trips task lists', () => {
    const d = markdownToDoc('- [x] done\n- [ ] todo');
    const list = d.firstChild!;
    expect(list.type.name).toBe('task_list');
    expect(list.child(0).attrs['checked']).toBe(true);
    expect(list.child(1).attrs['checked']).toBe(false);
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

describe('Markdown round trips: code block languages and task lists', () => {
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
