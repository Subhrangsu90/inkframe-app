import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '../../schema/schema';
import { docToHtml, htmlToDoc } from '../../io/html';
import { docToMarkdown, markdownToDoc } from '../../io/markdown';
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
