import { describe, it, expect, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import Prism from 'prismjs';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
import { randomEdit, sampleDoc, seededRandom } from '../../editor/random-edits.fixtures';
import { highlightKey, highlightPlugin } from './highlight.plugin';

describe('Code blocks', () => {
  it('creates code_block with custom language and wrap attributes', () => {
    const codeNode = schema.nodes['code_block'].create(
      { language: 'python', wrap: true },
      schema.text('def greet():\n    return "hi"'),
    );

    expect(codeNode.attrs['language']).toBe('python');
    expect(codeNode.attrs['wrap']).toBe(true);
    expect(codeNode.textContent).toBe('def greet():\n    return "hi"');
  });

  it('round-trips code block language via Markdown serialization & parsing', () => {
    const doc = schema.node('doc', null, [
      schema.nodes['code_block'].create(
        { language: 'typescript' },
        schema.text('const answer: number = 42;'),
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
        schema.text('fn main() { println!("Hello!"); }'),
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
      schema.text('import { schema } from "./schema";'),
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

describe('Syntax highlighting while editing', () => {
  const { nodes } = schema;
  const p = (text: string) => nodes['paragraph'].create(null, schema.text(text));
  const code = (text: string, language = 'typescript') =>
    nodes['code_block'].create({ language }, schema.text(text));
  const stateOf = (doc: PMNode) =>
    EditorState.create({ schema, doc, plugins: [highlightPlugin()] });
  /** The token decorations, comparable. */
  const tokens = (state: EditorState) =>
    highlightKey
      .getState(state)
      .find()
      .map((d: any) => `${d.from}-${d.to} ${d.type.attrs.class}`)
      .sort();
  /** The same document highlighted from scratch. */
  const fromScratch = (state: EditorState) => tokens(stateOf(state.doc));

  it('tokenizes nothing for typing outside code, and moves the tokens along', () => {
    let state = stateOf(nodes['doc'].create(null, [p('Intro'), code('const a = 1;'), p('End')]));
    const tokenize = vi.spyOn(Prism, 'tokenize');
    try {
      state = state.apply(state.tr.insertText('More text. ', 1));
      expect(tokenize).not.toHaveBeenCalled();
      expect(tokens(state)).toEqual(fromScratch(state));
      expect(tokens(state).length).toBeGreaterThan(0);
    } finally {
      tokenize.mockRestore();
    }
  });

  it('tokenizes only the code block that changed', () => {
    let state = stateOf(
      nodes['doc'].create(null, [code('const a = 1;'), p('Between'), code('let b = "x";')]),
    );
    const tokenize = vi.spyOn(Prism, 'tokenize');
    try {
      state = state.apply(state.tr.insertText(' // note', 13));
      expect(tokenize).toHaveBeenCalledTimes(1);
      expect(tokens(state)).toEqual(fromScratch(state));
    } finally {
      tokenize.mockRestore();
    }
  });

  it('highlights again when the language changes, and drops tokens when code becomes a paragraph', () => {
    let state = stateOf(nodes['doc'].create(null, [code('print("hi") # comment', 'python')]));
    state = state.apply(state.tr.setNodeMarkup(0, undefined, { language: 'json' }));
    expect(tokens(state)).toEqual(fromScratch(state));

    state = state.apply(state.tr.setNodeMarkup(0, nodes['paragraph']));
    expect(tokens(state)).toEqual([]);
  });

  it('redecorates a long code block whole when most of its tokens change', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `const v${i} = f("s", ${i});`);
    let state = stateOf(nodes['doc'].create(null, [p('Intro'), code(lines.join('\n')), p('End')]));
    const before = tokens(state).length;

    // Opening a comment at the top turns all that follows into one comment token.
    state = state.apply(state.tr.insertText('/* ', 8));
    expect(tokens(state)).toEqual(fromScratch(state));
    expect(tokens(state).length).toBeLessThan(before / 10);

    state = state.apply(state.tr.insertText(' */', 11));
    expect(tokens(state)).toEqual(fromScratch(state));
    expect(tokens(state).length).toBeGreaterThan(before / 2);
  });

  it('keeps the tokens of code that a replace rebuilt unchanged', () => {
    // As list commands do: the whole list replaced by new nodes, some of
    // them the same as before.
    const item = (...content: PMNode[]) => nodes['list_item'].create(null, content);
    const list = (...items: PMNode[]) => nodes['bullet_list'].create(null, items);
    let state = stateOf(
      nodes['doc'].create(null, [
        list(item(p('one')), item(p('two')), item(p('three'), code('const a = 1;'))),
      ]),
    );
    const doc = state.doc;
    const [, two, three] = [0, 1, 2].map((i) => doc.firstChild!.child(i));
    state = state.apply(
      state.tr.replaceWith(0, doc.content.size, [
        list(doc.firstChild!.child(0)),
        two.firstChild!,
        list(three),
      ]),
    );
    expect(tokens(state).length).toBeGreaterThan(0);
    expect(tokens(state)).toEqual(fromScratch(state));
  });

  it('stays the same as highlighting from scratch through many random edits', () => {
    for (const seed of [1, 2, 3]) {
      const random = seededRandom(seed);
      let state = stateOf(sampleDoc());
      for (let step = 0; step < 300; step++) {
        const tr = randomEdit(state, random);
        if (!tr?.docChanged) continue;
        state = state.apply(tr);
        expect(tokens(state), `seed ${seed}, step ${step}`).toEqual(fromScratch(state));
      }
    }
  });
});
