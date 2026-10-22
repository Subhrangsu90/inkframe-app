import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { schema } from '../schema/schema';
import { WORDS_PER_MINUTE, countWords, docStats, docText, textStats } from './doc-stats';
import { randomEdit, sampleDoc, seededRandom } from './random-edits.fixtures';
import {
  DEFAULT_PLACEHOLDER,
  isDocEmpty,
  placeholderPlugin,
} from '../extensions/placeholder/placeholder.plugin';

const { nodes, marks } = schema;
const p = (...content: (string | PMNode)[]) =>
  nodes['paragraph'].create(
    null,
    content.map((c) => (typeof c === 'string' ? schema.text(c) : c)),
  );
const doc = (...content: PMNode[]) => nodes['doc'].create(null, content);

describe('countWords', () => {
  it('counts runs of text with a letter or digit', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('Hello, world!')).toBe(2);
    expect(countWords("don't stop — well-known 42")).toBe(4); // the dash alone is not a word
    expect(countWords('one\ntwo\tthree')).toBe(3);
  });

  it('counts each Chinese or Japanese character as a word', () => {
    expect(countWords('我爱你')).toBe(3);
    expect(countWords('東京 Tokyo')).toBe(3);
    expect(countWords('안녕하세요 세계')).toBe(2); // Korean separates words with spaces
  });
});

describe('docStats', () => {
  it('counts words across blocks and formatting, and characters without line breaks', () => {
    const bold = schema.text('ld', [marks['strong'].create()]);
    const d = doc(
      nodes['heading'].create({ level: 1 }, [schema.text('Title')]),
      p('A bo', bold, ' word'), // "bold" is one word although it has two text nodes
      p('line', nodes['hard_break'].create(), 'break'),
      nodes['code_block'].create(null, [schema.text('a = 1\nb = 2')]),
    );
    const stats = docStats(d);
    expect(stats.words).toBe(1 + 3 + 2 + 4); // Title | A bold word | line break | a 1 b 2
    expect(stats.characters).toBe(
      'Title'.length + 'A bold word'.length + 'linebreak'.length + 'a = 1b = 2'.length,
    );
    expect(stats.readingMinutes).toBe(1);
  });

  it('counts emoji once and rounds reading time up', () => {
    expect(docStats(doc(p('👍 ok'))).characters).toBe(4);
    const words = Array.from({ length: WORDS_PER_MINUTE + 1 }, () => 'word').join(' ');
    expect(docStats(doc(p(words))).readingMinutes).toBe(2);
    expect(docStats(doc(p()))).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
  });
});

describe('placeholderPlugin', () => {
  const decorationsOf = (d: PMNode) => {
    const state = EditorState.create({ schema, doc: d, plugins: [placeholderPlugin()] });
    const set = state.plugins[0].props.decorations!.call(state.plugins[0], state) as any;
    return set ? set.find() : [];
  };

  it('decorates only a document holding one empty paragraph', () => {
    expect(isDocEmpty(doc(p()))).toBe(true);
    const [decoration] = decorationsOf(doc(p()));
    expect(decoration.type.attrs).toEqual({
      class: 'ink-placeholder',
      'data-placeholder': DEFAULT_PLACEHOLDER,
    });

    expect(decorationsOf(doc(p('text')))).toHaveLength(0);
    expect(decorationsOf(doc(p(), p()))).toHaveLength(0);
    expect(decorationsOf(doc(nodes['heading'].create({ level: 1 })))).toHaveLength(0);
  });

  it('exposes the placeholder to assistive technology', () => {
    const plugin = placeholderPlugin('Start writing');
    const empty = EditorState.create({ schema, doc: doc(p()), plugins: [plugin] });
    const full = EditorState.create({ schema, doc: doc(p('x')), plugins: [plugin] });
    const attributes = plugin.props.attributes as (s: EditorState) => Record<string, string>;
    expect(attributes(empty)).toEqual({ 'aria-placeholder': 'Start writing' });
    expect(attributes(full)).toEqual({});
  });
});

describe('docStats while editing', () => {
  it('stays the same as counting the whole text, through many random edits', () => {
    for (const seed of [11, 12, 13]) {
      const random = seededRandom(seed);
      let state = EditorState.create({ schema, doc: sampleDoc() });
      for (let step = 0; step < 300; step++) {
        const tr = randomEdit(state, random);
        if (!tr?.docChanged) continue;
        state = state.apply(tr);
        expect(docStats(state.doc), `seed ${seed}, step ${step}`).toEqual(
          textStats(docText(state.doc)),
        );
      }
    }
  });
});

describe('countWords on mixed scripts', () => {
  const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  /** The rule with Unicode patterns only, to check the faster countWords against. */
  const reference = (text: string) => {
    let words = 0;
    for (const token of text.split(/\s+/)) {
      if (!token) continue;
      const cjk = token.match(CJK)?.length ?? 0;
      words += cjk;
      if (/[\p{L}\p{N}]/u.test(cjk ? token.replace(CJK, '') : token)) words++;
    }
    return words;
  };

  it('counts the same as the Unicode rule on random text', () => {
    const random = seededRandom(5);
    const pieces = [
      'a',
      'Z',
      '7',
      '-',
      "'",
      '.',
      '@',
      '[',
      '`',
      '—',
      '…',
      '¿',
      'é',
      'é',
      'ß',
      'λ',
      'ж',
      '٣',
      '中',
      'ひ',
      'カ',
      '々',
      '〇',
      '한',
      '👍',
      '𠀀',
      ' ',
      '\n',
      ' ',
      '　',
      '\t',
    ];
    for (let i = 0; i < 3000; i++) {
      const length = 1 + Math.floor(random() * 30);
      const text = Array.from({ length }, () => pieces[Math.floor(random() * pieces.length)]).join(
        '',
      );
      expect(countWords(text), JSON.stringify(text)).toBe(reference(text));
    }
  });
});
