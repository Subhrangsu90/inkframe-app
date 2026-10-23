import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import Prism from 'prismjs';
import { getGrammar } from './prism-highlight';

export const highlightKey = new PluginKey('syntax-highlight');

export function highlightPlugin(): Plugin {
  return new Plugin({
    key: highlightKey,
    state: {
      init(_, { doc }) {
        return DecorationSet.create(doc, codeDecorations(doc, 0, doc.content.size));
      },
      apply(tr, oldSet) {
        if (!tr.docChanged) return oldSet;
        return updateDecorations(tr, oldSet);
      },
    },
    props: {
      decorations(state) {
        return highlightKey.getState(state);
      },
    },
  });
}

/**
 * A code block whose tokens changed more than this is redecorated whole:
 * DecorationSet.remove compares each decoration it removes with every
 * other one in the block, which gets slow for many.
 */
const MAX_TOKENS_REPLACED = 100;

/** The same token: same place, same classes (`spec.token`, see tokenDecorations). */
const sameToken = (a: Decoration, b: Decoration) =>
  a.from === b.from && a.to === b.to && a.spec['token'] === b.spec['token'];
const byPosition = (a: Decoration, b: Decoration) => a.from - b.from || a.to - b.to;

/**
 * The decorations after an edit. Those of code blocks it left alone move
 * with the text (mapped), so typing outside code costs no tokenizing. A
 * code block it changed is tokenized again, and only the tokens that came
 * out different are replaced: usually one or two per keystroke.
 */
function updateDecorations(tr: Transaction, set: DecorationSet): DecorationSet {
  const doc = tr.doc;
  let mapped = set.map(tr.mapping, doc);
  // The changed part of the document: what differs (attribute changes, such
  // as a code block's language, move no text), and what the steps replaced
  // even where it came out the same. Mapping dropped the tokens in there: a
  // list command, say, replaces a whole list with the lists around an item.
  let from = Infinity;
  let to = -Infinity;
  const start = doc.content.findDiffStart(tr.before.content);
  if (start != null) {
    const end = doc.content.findDiffEnd(tr.before.content);
    // With repeated text, the end can be found before the start.
    from = start;
    to = Math.max(end?.a ?? start, start);
  }
  tr.mapping.maps.forEach((map, i) => {
    const later = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, later.map(newStart, -1));
      to = Math.max(to, later.map(newEnd, 1));
    });
  });
  if (from > to) return mapped;
  from = Math.max(0, from);
  to = Math.min(doc.content.size, to);
  // Whole code blocks: a change anywhere in one tokenizes all of it again.
  const blocks: { node: PMNode; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return true;
    blocks.push({ node, pos });
    from = Math.min(from, pos);
    to = Math.max(to, pos + node.nodeSize);
    return false;
  });
  if (from === to) return mapped;

  // Ranges to clear of every token: mapped through a replace of a range,
  // an inline decoration strictly inside it goes. Code blocks begin and end
  // the ranges, so all the tokens in them are strictly inside.
  const clear: number[] = [];
  const clearRange = (a: number, b: number) => {
    if (b > a) clear.push(a, b - a, b - a);
  };
  const removed: Decoration[] = [];
  const added: Decoration[] = [];
  let gapStart = from;
  for (const { node, pos } of blocks) {
    // Between code blocks, tokens are left over: a code block became a paragraph.
    clearRange(gapStart, pos);
    gapStart = pos + node.nodeSize;

    const fresh: Decoration[] = [];
    tokenDecorations(node, pos, fresh);
    const old = mapped.find(pos, pos + node.nodeSize).sort(byPosition);
    let same = 0;
    while (same < old.length && same < fresh.length && sameToken(old[same], fresh[same])) same++;
    let oldEnd = old.length;
    let freshEnd = fresh.length;
    while (oldEnd > same && freshEnd > same && sameToken(old[oldEnd - 1], fresh[freshEnd - 1])) {
      oldEnd--;
      freshEnd--;
    }
    if (oldEnd - same > MAX_TOKENS_REPLACED) {
      clearRange(pos, pos + node.nodeSize);
      added.push(...fresh);
    } else {
      removed.push(...old.slice(same, oldEnd));
      added.push(...fresh.slice(same, freshEnd));
    }
  }
  clearRange(gapStart, to);

  if (clear.length) mapped = mapped.map(new Mapping([new StepMap(clear)]), doc);
  return mapped.remove(removed).add(doc, added);
}

/** The token decorations of the code blocks between `from` and `to`. */
function codeDecorations(doc: PMNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return true;
    tokenDecorations(node, pos, decorations);
    return false;
  });
  return decorations;
}

/** Adds the token decorations of the code block at `pos` to `decorations`. */
function tokenDecorations(node: PMNode, pos: number, decorations: Decoration[]): void {
  const text = node.textContent;
  if (!text) return;

  const lang = node.attrs['language'] || 'typescript';
  const grammar = getGrammar(lang);
  if (!grammar) return;

  const tokens = Prism.tokenize(text, grammar);
  let offset = 0;

  // The classes go in the spec too, to compare tokens (see updateDecorations).
  const push = (length: number, type: string) => {
    const from = pos + 1 + offset;
    const token = `token ${type}`;
    decorations.push(Decoration.inline(from, from + length, { class: token }, { token }));
  };

  function walk(tokenList: (string | Prism.Token)[], parentType?: string) {
    for (const token of tokenList) {
      if (typeof token === 'string') {
        if (parentType) push(token.length, parentType);
        offset += token.length;
      } else {
        const tokenType = parentType ? `${parentType} ${token.type}` : token.type;
        if (typeof token.content === 'string') {
          push(token.length, tokenType);
          offset += token.length;
        } else if (Array.isArray(token.content)) {
          walk(token.content, tokenType);
        } else if (token.content instanceof Prism.Token) {
          walk([token.content], tokenType);
        } else {
          offset += token.length;
        }
      }
    }
  }

  walk(tokens);
}
