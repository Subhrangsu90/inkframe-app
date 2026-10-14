import { Command, EditorState } from 'prosemirror-state';
import { setBlockType, splitBlockAs } from 'prosemirror-commands';
import { Attrs, Node as PMNode, NodeType } from 'prosemirror-model';
import { TextAlign, sanitizeTextAlign } from './text-align-schema';

const supportsAlign = (type: NodeType) => !!type.spec.attrs?.['align'];

/** Calls `f` for every textblock the selection touches (each cell of a cell selection). */
function forEachSelectedTextblock(
  state: EditorState,
  f: (node: PMNode, pos: number) => void,
): void {
  for (const { $from, $to } of state.selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      f(node, pos);
      return false;
    });
  }
}

/**
 * Aligns the paragraphs and headings in the selection. `left` (or null)
 * resets to the default. Not applicable when the selection only covers
 * blocks that cannot be aligned, such as code blocks.
 */
export function setTextAlignCommand(align: TextAlign | null): Command {
  const value = sanitizeTextAlign(align);
  return (state, dispatch) => {
    const targets: number[] = [];
    forEachSelectedTextblock(state, (node, pos) => {
      if (supportsAlign(node.type)) targets.push(pos);
    });
    if (!targets.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of targets) {
        if (tr.doc.nodeAt(pos)!.attrs['align'] !== value) tr.setNodeAttribute(pos, 'align', value);
      }
      dispatch(tr);
    }
    return true;
  };
}

/** The alignment of the textblock at the selection head, or null when it cannot be aligned. */
export function textAlignAt(state: EditorState): TextAlign | null {
  const parent = state.selection.$head.parent;
  if (!supportsAlign(parent.type)) return null;
  return sanitizeTextAlign(parent.attrs['align']) ?? 'left';
}

/**
 * `setBlockType` that keeps each block's alignment, so turning a centered
 * paragraph into a heading (or back) keeps it centered.
 */
export function setBlockTypeKeepingAlign(nodeType: NodeType, attrs: Attrs | null = null): Command {
  const command = setBlockType(nodeType, attrs);
  if (!supportsAlign(nodeType)) return command;
  return (state, dispatch, view) =>
    command(
      state,
      dispatch &&
        ((tr) => {
          forEachSelectedTextblock(state, (node, pos) => {
            const align = node.attrs['align'];
            const mapped = tr.mapping.map(pos);
            const now = tr.doc.nodeAt(mapped);
            if (align && now?.type === nodeType && now.attrs['align'] !== align) {
              tr.setNodeAttribute(mapped, 'align', align);
            }
          });
          dispatch(tr);
        }),
      view,
    );
}

/**
 * Enter at the end of an aligned paragraph or heading: the new paragraph
 * keeps the alignment, as in word processors. Returns false otherwise so the
 * default Enter behavior runs (splitting in the middle already keeps attributes).
 */
export const splitAlignedBlockCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const parent = $from.parent;
  const align = sanitizeTextAlign(parent.attrs['align']);
  const paragraph = state.schema.nodes['paragraph'];
  if (
    !empty ||
    !align ||
    !paragraph ||
    !supportsAlign(paragraph) ||
    parent.content.size === 0 ||
    $from.parentOffset !== parent.content.size
  ) {
    return false;
  }
  return splitBlockAs((_node, atEnd) => (atEnd ? { type: paragraph, attrs: { align } } : null))(
    state,
    dispatch,
  );
};
