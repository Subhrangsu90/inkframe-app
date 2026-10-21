import { Command, EditorState } from 'prosemirror-state';
import { NodeType } from 'prosemirror-model';
import { TextAlign, sanitizeTextAlign } from './text-align-schema';
import {
  forEachSelectedTextblock,
  setBlockTypeKeepingFormat,
  splitFormattedBlockCommand,
} from '../paragraph-format/paragraph-format-commands';

const supportsAlign = (type: NodeType) => !!type.spec.attrs?.['align'];

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
 * @deprecated Use `setBlockTypeKeepingFormat`, which keeps the indent and
 * line spacing too (as this does now). Removed in 2.0.
 */
export const setBlockTypeKeepingAlign = setBlockTypeKeepingFormat;

/**
 * @deprecated Use `splitFormattedBlockCommand`, which carries the indent and
 * line spacing too (as this does now). Removed in 2.0.
 */
export const splitAlignedBlockCommand = splitFormattedBlockCommand;
