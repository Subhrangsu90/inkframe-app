import { Node as PMNode } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { canJoin } from 'prosemirror-transform';
import { schema } from '../schema/schema';

/*
 * Random edits for tests that check something kept up to date edit by edit
 * (syntax highlighting, document statistics) against working it out again
 * from scratch.
 */

/** Numbers in [0, 1) from a seed, so a failing run can be replayed. */
export function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { nodes } = schema;
const p = (text: string) => nodes['paragraph'].create(null, text ? schema.text(text) : undefined);
const code = (text: string, language: string) =>
  nodes['code_block'].create({ language }, text ? schema.text(text) : undefined);

/** Paragraphs, a heading and code blocks, also inside a quote and a list. */
export function sampleDoc(): PMNode {
  return nodes['doc'].create(null, [
    nodes['heading'].create({ level: 1 }, schema.text('Title')),
    p('Some words here.'),
    code('const a = 1;\nlet b = "x"; // note', 'typescript'),
    p('More text, 中文 and 👍'),
    nodes['blockquote'].create(null, [p('Quoted'), code('print("hi")', 'python')]),
    nodes['bullet_list'].create(null, [
      nodes['list_item'].create(null, [p('Item'), code('{"a": 1}', 'json')]),
    ]),
    code('', 'javascript'),
    p(''),
  ]);
}

const SNIPPETS = [
  'const ',
  'x',
  ' = ',
  '"text"',
  ' // note',
  '\n',
  '42',
  '{',
  '}',
  ' word',
  '中文',
  '👍',
];
const LANGUAGES = ['typescript', 'python', 'json', 'plain', 'bash'];

/** Every textblock, with its position. */
function textblocks(doc: PMNode): { node: PMNode; pos: number }[] {
  const found: { node: PMNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    found.push({ node, pos });
    return false;
  });
  return found;
}

/**
 * A place in a textblock where the caret can be: never between the two
 * UTF-16 units of one character (an emoji, say).
 */
function caretIn(doc: PMNode, block: { node: PMNode; pos: number }, random: () => number): number {
  const pos = block.pos + 1 + Math.floor(random() * (block.node.content.size + 1));
  const before = doc.resolve(pos).nodeBefore;
  const unit = before?.isText ? before.text!.charCodeAt(before.text!.length - 1) : 0;
  return unit >= 0xd800 && unit <= 0xdbff ? pos - 1 : pos;
}

/**
 * An edit like the ones people make: typing, deleting (within a block or
 * across blocks), line breaks, splitting and joining blocks, turning
 * paragraphs into code and back, and changing a code block's language.
 * Null when the edit chosen can't be made at the place chosen.
 */
export function randomEdit(state: EditorState, random: () => number): Transaction | null {
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const doc = state.doc;
  const blocks = textblocks(doc);
  if (blocks.length === 0) return null;
  const block = pick(blocks);
  const at = caretIn(doc, block, random);
  const tr = state.tr;
  try {
    switch (Math.floor(random() * 7)) {
      case 0:
      case 1:
        return tr.insertText(pick(SNIPPETS), at);
      case 2: {
        const to = caretIn(doc, pick(blocks), random);
        return tr.delete(Math.min(at, to), Math.max(at, to));
      }
      case 3:
        return block.node.type.name === 'code_block'
          ? null
          : tr.replaceWith(at, at, nodes['hard_break'].create());
      case 4:
        return tr.split(at);
      case 5:
        return canJoin(doc, block.pos) ? tr.join(block.pos) : null;
      default:
        if (block.node.type.name === 'code_block') {
          return random() < 0.5
            ? tr.setNodeMarkup(block.pos, undefined, { language: pick(LANGUAGES) })
            : tr.setNodeMarkup(block.pos, nodes['paragraph']);
        }
        return block.node.type.name === 'paragraph'
          ? tr.setNodeMarkup(block.pos, nodes['code_block'], { language: pick(LANGUAGES) })
          : null;
    }
  } catch {
    return null; // not allowed there (a list item must start with a paragraph, for one)
  }
}
