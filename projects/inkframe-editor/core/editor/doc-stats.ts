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
    if (!mayHaveCjk(token)) {
      if (hasWordChar(token)) words++;
      continue;
    }
    const cjk = token.match(CJK)?.length ?? 0;
    words += cjk;
    if (WORD_CHAR.test(cjk ? token.replace(CJK, '') : token)) words++;
  }
  return words;
}

/** Every Chinese and Japanese character is at U+2E80 or above, so most tokens skip that test. */
function mayHaveCjk(token: string): boolean {
  for (let i = 0; i < token.length; i++) if (token.charCodeAt(i) >= 0x2e80) return true;
  return false;
}

/** WORD_CHAR.test(token), checking ASCII letters and digits without the Unicode pattern. */
function hasWordChar(token: string): boolean {
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    if (c >= 0x80) return WORD_CHAR.test(token); // letters and digits of other scripts
    const lower = c | 0x20;
    if ((c >= 0x30 && c <= 0x39) || (lower >= 0x61 && lower <= 0x7a)) return true;
  }
  return false;
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

interface Counts {
  words: number;
  characters: number;
}

/**
 * Counts per node, kept while the node exists. Each edit makes a new
 * document that shares every node it left alone, so counting again after a
 * keystroke only counts the paragraph it changed.
 */
const counted = new WeakMap<PMNode, Counts>();

/**
 * A node's counts: a textblock's own, or the sum of its blocks'. Summing is
 * exact because words never run from one block into the next (docText puts
 * a line break between them).
 */
function countsOf(node: PMNode): Counts {
  let counts = counted.get(node);
  if (counts) return counts;
  if (node.isTextblock) {
    const text = docText(node);
    counts = { words: countWords(text), characters: countCharacters(text.replace(/\n/g, '')) };
  } else {
    counts = { words: 0, characters: 0 };
    for (let i = 0; i < node.childCount; i++) {
      const child = countsOf(node.child(i));
      counts.words += child.words;
      counts.characters += child.characters;
    }
  }
  counted.set(node, counts);
  return counts;
}

/** The same as `textStats(docText(doc))`, counting again only what changed since the last call. */
export function docStats(doc: PMNode): DocStats {
  const { words, characters } = countsOf(doc);
  return { words, characters, readingMinutes: Math.ceil(words / WORDS_PER_MINUTE) };
}
