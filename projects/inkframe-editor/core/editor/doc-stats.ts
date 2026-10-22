import { Node as PMNode } from 'prosemirror-model';

export interface DocStats {
  words: number;
  /** Code points of text, spaces included and line breaks excluded (so most emoji count once). */
  characters: number;
  /** Rounded up; 0 for an empty document. */
  readingMinutes: number;
}

/** Average silent reading speed for non-fiction (Brysbaert, 2019). */
export const WORDS_PER_MINUTE = 238;

// Chinese and Japanese are written without spaces between words; as in common
// word processors, each of their characters counts as one word. (Korean uses
// spaces, so it is counted like other languages.)
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Counts words the way word processors do: runs of text between whitespace
 * that contain a letter or digit ("don't" and "well-known" are one word, a
 * lone "—" is none), plus one per CJK character.
 */
export function countWords(text: string): number {
  let words = 0;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const cjk = token.match(CJK)?.length ?? 0;
    words += cjk;
    if (WORD_CHAR.test(cjk ? token.replace(CJK, '') : token)) words++;
  }
  return words;
}

function countCharacters(text: string): number {
  let n = 0;
  for (const _ of text) n++; // iterates code points, not UTF-16 units
  return n;
}

// Blocks and hard breaks separate words; images and other leaves add nothing.
const leafText = (leaf: PMNode) => (leaf.type.name === 'hard_break' ? '\n' : '');

/** The text of `doc` between `from` and `to`, with a line break between blocks. */
export function docText(doc: PMNode, from = 0, to = doc.content.size): string {
  return doc.textBetween(from, to, '\n', leafText);
}

export function textStats(text: string): DocStats {
  const words = countWords(text);
  return {
    words,
    characters: countCharacters(text.replace(/\n/g, '')),
    readingMinutes: Math.ceil(words / WORDS_PER_MINUTE),
  };
}

export function docStats(doc: PMNode): DocStats {
  return textStats(docText(doc));
}
