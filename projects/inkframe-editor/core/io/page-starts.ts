import { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { MAX_LIST_START } from '../extensions/lists/list-schema';

/**
 * The document with a page break at each of `starts`: the positions where
 * page view starts a page on screen (`EditorService.pageStarts()`). Printed
 * with these breaks, the pages are the pages on screen: each holds what the
 * screen page holds, and print never needs more room than the editor (which
 * draws handles, toolbars and icons around tables, code and callouts).
 *
 * A start inside a paragraph, list, table or code block splits it there, so
 * the halves sit on two pages. Numbered lists split this way keep counting;
 * an item cut in two shows its number again on the next page. Inside a nested
 * list, which cannot be split this way, the page starts before the outer
 * list. Starts right after a page break add nothing (that page break already
 * starts the page).
 */
export function withPageStarts(doc: PMNode, starts: readonly number[]): PMNode {
  const pageBreak = doc.type.schema.nodes['page_break'];
  if (!pageBreak || !starts.length) return doc;
  const tr = new Transform(doc);
  // From the end, so the positions before each change stay valid.
  for (const start of [...new Set(starts)].sort((a, b) => b - a)) {
    if (!Number.isInteger(start) || start <= 0 || start >= tr.doc.content.size) continue;
    let pos = start;
    let $pos = tr.doc.resolve(pos);
    // A code line starts after a line break: split before the line break,
    // and drop it from the second half, so neither half has an empty line.
    const codeLine = !!$pos.parent.type.spec.code && !!$pos.nodeBefore?.text?.endsWith('\n');
    if (codeLine) $pos = tr.doc.resolve(--pos);
    // At the start or end of a node, break before or after the node rather
    // than split off an empty one. Where a split would leave an invalid half
    // (a list item must start with a paragraph), break before the node.
    for (;;) {
      const atEdge = () =>
        $pos.parentOffset === 0 || $pos.parentOffset === $pos.parent.content.size;
      while ($pos.depth > 0 && atEdge()) {
        pos = $pos.parentOffset === 0 ? $pos.before() : $pos.after();
        $pos = tr.doc.resolve(pos);
      }
      if ($pos.depth === 0 || canSplitToTop($pos)) break;
      $pos = tr.doc.resolve((pos = $pos.before()));
    }
    // The first page starts at the top anyway, and a break at the end adds an empty page.
    if (pos === 0 || pos === tr.doc.content.size) continue;
    const depth = $pos.depth;
    let at = pos;
    if (depth > 0) {
      // The first number of each numbered list's second half.
      const orders: { depth: number; order: number }[] = [];
      for (let d = 1; d <= depth; d++) {
        const node = $pos.node(d);
        if (node.type.name !== 'ordered_list') continue;
        const order = (Number(node.attrs['order']) || 0) + $pos.index(d);
        orders.push({ depth: d, order: Math.min(order, MAX_LIST_START) });
      }
      tr.split(pos, depth);
      at = pos + depth; // between the two top-level halves
      // The second half's node at depth d starts d - 1 after `at`.
      for (const { depth: d, order } of orders) tr.setNodeAttribute(at + d - 1, 'order', order);
      if (codeLine && pos === start - 1) tr.delete(at + depth, at + depth + 1);
    }
    if (tr.doc.resolve(at).nodeBefore?.type === pageBreak) continue;
    tr.insert(at, pageBreak.create());
  }
  return tr.doc;
}

const TABLE_PARTS = new Set(['row', 'cell', 'header_cell']);

/**
 * Whether splitting every node around `$pos`, up to the top level, leaves
 * valid halves. Unlike `canSplit`, it splits tables (between rows), which are
 * isolating for editing; it never splits a row or a cell.
 */
function canSplitToTop($pos: ResolvedPos): boolean {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (TABLE_PARTS.has(node.type.spec['tableRole'])) return false;
    // Above the innermost node, the child split in two stands for each half.
    const inner = d === $pos.depth;
    const start = $pos.start(d);
    const first = node.content.cut(0, (inner ? $pos.pos : $pos.after(d + 1)) - start);
    const second = node.content.cut((inner ? $pos.pos : $pos.before(d + 1)) - start);
    if (!first.size || !second.size) return false;
    if (!node.type.validContent(first) || !node.type.validContent(second)) return false;
  }
  return true;
}
