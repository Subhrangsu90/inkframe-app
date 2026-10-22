import { Node as PMNode } from 'prosemirror-model';

/*
 * Page starts of a document shown as HTML (StaticPageView), as positions in
 * the document, for printing those pages (`docToHtmlDocument`'s
 * `pageStarts`). The HTML has no document positions, so the HTML and the
 * document are counted the same way, in document order: one for each
 * paragraph, heading and code block (at its start), one for each character
 * of their text, and one for each image, line break, horizontal rule and
 * page break.
 */

const TEXTBLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);
const LEAF_TAGS = new Set(['IMG', 'BR', 'HR']);
const TEXT_NODE = 3;

/** The count before each page spacer (`.ink-page-spacer`) in `root`, which holds `docToHtml()` output. */
export function spacerOffsets(root: Element): number[] {
  const offsets: number[] = [];
  let count = 0;
  const visit = (parent: Node, inTextblock: boolean): void => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) {
        // Text outside paragraphs (white space between blocks) is not in the document.
        if (inTextblock) count += (child as Text).data.length;
        continue;
      }
      if (!(child instanceof Element)) continue;
      if (child.classList.contains('ink-page-spacer')) {
        offsets.push(count);
      } else if (LEAF_TAGS.has(child.tagName) || child.classList.contains('ink-page-break')) {
        count++;
      } else if (TEXTBLOCK_TAGS.has(child.tagName)) {
        count++;
        visit(child, true);
      } else {
        visit(child, inTextblock);
      }
    }
  };
  visit(root, false);
  return offsets;
}

/** The position in `doc` at `offset` (counted as above); null past the end. */
export function positionAtOffset(doc: PMNode, offset: number): number | null {
  let count = 0;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isTextblock) {
      if (count === offset) found = pos + 1; // the start of its content
      count++;
      return found === null;
    }
    if (node.isText) {
      const length = node.text!.length;
      if (offset < count + length) found = pos + (offset - count);
      count += length;
      return false;
    }
    if (node.isLeaf) {
      if (count === offset) found = pos;
      count++;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Where the pages shown in `root` start (its page spacers), as positions in
 * `doc`, the document whose `docToHtml()` output `root` holds.
 */
export function pageStartsInHtml(root: Element, doc: PMNode): number[] {
  return spacerOffsets(root)
    .map((offset) => positionAtOffset(doc, offset))
    .filter((pos): pos is number => pos !== null);
}
