import { DocJSON, StoredDoc, countWords } from '@inkframe-ui/editor/core';

/**
 * Raised when extractDocExcerpt changes what it produces, so previews saved
 * by an older version are rebuilt (see DocumentManager.backfillExcerpts).
 */
export const EXCERPT_VERSION = 2;

/** A node's children; documents from share links may be malformed, so check. */
const childrenOf = (node: DocJSON | undefined): DocJSON[] =>
  node && Array.isArray(node.content) ? node.content : [];

const inlineText = (node: DocJSON) =>
  childrenOf(node)
    .map((c) => c.text || '')
    .join('')
    .trim();

export function extractDocTitle(stored: StoredDoc): string {
  try {
    const blocks = childrenOf(stored?.doc as DocJSON | undefined);
    for (const node of blocks) {
      if (node.type === 'heading') {
        const text = inlineText(node);
        if (text) return text;
      }
    }
    for (const node of blocks) {
      if (node.type === 'paragraph') {
        const text = inlineText(node);
        if (text) {
          return text.length > 40 ? text.slice(0, 40) + '...' : text;
        }
      }
    }
  } catch {
    // Malformed document: use the default title.
  }
  return 'Untitled Document';
}

function plainText(node: DocJSON | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hard_break') return ' ';
  const children = childrenOf(node);
  // Text runs inside one paragraph join directly; separate blocks get a space.
  const inline = children.every((c) => typeof c.text === 'string' || c.type === 'hard_break');
  return children.map(plainText).join(inline ? '' : ' ');
}

/**
 * The text of each paragraph-like block inside a node (list items, quotes,
 * table cells and code blocks included), in document order.
 */
function textBlocks(node: DocJSON): string[] {
  const children = childrenOf(node);
  // A block whose children carry no content of their own holds only inline text.
  if (children.every((c) => !Array.isArray(c.content))) return [plainText(node)];
  return children.flatMap(textBlocks);
}

/**
 * A short plain-text preview of a document for lists and cards.
 *
 * Section headings are left out, since on one line they run into the text
 * around them ("Overview This design doc…"). A leading heading stays when it
 * is not the title, because it often says what the document is about.
 * Headings are used only when the document has no other text. Blocks are
 * separated by " · " unless the previous one ends a sentence.
 */
export function extractDocExcerpt(stored: StoredDoc, title = '', maxLength = 180): string {
  try {
    const blocks = childrenOf(stored?.doc as DocJSON | undefined);
    const first = blocks[0];
    const titleHeading = first?.type === 'heading' && plainText(first).trim() === title.trim();
    const clean = (texts: string[]) =>
      texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

    // The body text, only as far as the preview reaches: documents can be long.
    const bodyText = () => {
      let body = '';
      for (const block of blocks) {
        if (block.type === 'heading') continue;
        for (const part of clean(textBlocks(block))) {
          body = joinParts(body, part);
          if (body.length > maxLength) return body;
        }
      }
      return body;
    };
    const body = bodyText();
    let text: string;
    if (body) {
      const [lead] = clean(first?.type === 'heading' && !titleHeading ? [plainText(first)] : []);
      text = lead ? joinParts(lead, body) : body;
    } else {
      const headings = blocks.filter((b, i) => b.type === 'heading' && !(i === 0 && titleHeading));
      text = clean(headings.map(plainText)).reduce(joinParts, '');
    }
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
  } catch {
    return '';
  }
}

/** Joins preview parts with " · ", or with a space after one that ends a sentence. */
function joinParts(out: string, part: string): string {
  if (!out) return part;
  // Only the last character: testing `$` on the whole text gets slow as it grows.
  return out + (/[.!?:;…]/.test(out[out.length - 1]) ? ' ' : ' · ') + part;
}

/** Counted like the editor's status bar, so library cards and the editor agree. */
export function extractDocWordCount(stored: StoredDoc): number {
  try {
    return countWords(plainText(stored?.doc as DocJSON | undefined));
  } catch {
    return 0;
  }
}

/** The document's text without formatting, blocks separated by spaces. */
export function extractDocText(stored: StoredDoc): string {
  try {
    return plainText(stored?.doc as DocJSON | undefined);
  } catch {
    return '';
  }
}
