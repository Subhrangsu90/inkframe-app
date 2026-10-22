import { Command, EditorState } from 'prosemirror-state';
import { setBlockType, splitBlockAs } from 'prosemirror-commands';
import { Attrs, Node as PMNode, NodeType } from 'prosemirror-model';
import { findListItem, liftListItemCommand, sinkListItemCommand } from '../lists/list-commands';
import {
  BLOCK_FORMAT_ATTRS,
  LineSpacing,
  MAX_INDENT,
  blockFormatOf,
  sanitizeIndent,
  sanitizeLineSpacing,
} from './paragraph-format-schema';

const supports = (type: NodeType, attr: string) => !!type.spec.attrs?.[attr];

/** Calls `f` for every textblock the selection touches (each cell of a cell selection). */
export function forEachSelectedTextblock(
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
 * `setBlockType` that keeps each block's paragraph formatting (alignment,
 * indent and line spacing), so turning a centered paragraph into a heading
 * (or back) keeps it centered.
 */
export function setBlockTypeKeepingFormat(nodeType: NodeType, attrs: Attrs | null = null): Command {
  const command = setBlockType(nodeType, attrs);
  const carried = BLOCK_FORMAT_ATTRS.filter((name) => supports(nodeType, name));
  if (!carried.length) return command;
  return (state, dispatch, view) =>
    command(
      state,
      dispatch &&
        ((tr) => {
          forEachSelectedTextblock(state, (node, pos) => {
            const format = blockFormatOf(node);
            const mapped = tr.mapping.map(pos);
            if (tr.doc.nodeAt(mapped)?.type !== nodeType) return;
            for (const name of carried) {
              const value = format[name];
              if (value != null && tr.doc.nodeAt(mapped)!.attrs[name] !== value) {
                tr.setNodeAttribute(mapped, name, value);
              }
            }
          });
          dispatch(tr);
        }),
      view,
    );
}

/**
 * Enter at the end of a formatted paragraph or heading: the new paragraph
 * keeps its alignment, indent and line spacing, as in word processors.
 * Returns false otherwise so the default Enter behavior runs (splitting in
 * the middle already keeps attributes).
 */
export const splitFormattedBlockCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const parent = $from.parent;
  const paragraph = state.schema.nodes['paragraph'];
  if (
    !empty ||
    !paragraph ||
    parent.content.size === 0 ||
    $from.parentOffset !== parent.content.size
  ) {
    return false;
  }
  const attrs = Object.fromEntries(
    Object.entries(blockFormatOf(parent)).filter(([name]) => supports(paragraph, name)),
  );
  if (!Object.keys(attrs).length) return false;
  return splitBlockAs((_node, atEnd) => (atEnd ? { type: paragraph, attrs } : null))(
    state,
    dispatch,
  );
};

// ── Indent ────────────────────────────────────────────────────────

/** The indent level of the block at the selection head (0 for none). */
export function indentAt(state: EditorState): number {
  return sanitizeIndent(state.selection.$head.parent.attrs['indent']) ?? 0;
}

/**
 * Moves the paragraphs and headings in the selection one indent level in
 * (`delta` 1) or out (-1). In a list, it nests or un-nests the list items
 * instead, as Tab and Shift+Tab do. Not applicable when nothing would move.
 */
function changeIndentCommand(delta: 1 | -1): Command {
  return (state, dispatch, view) => {
    if (findListItem(state.selection.$from)) {
      return delta > 0
        ? sinkListItemCommand()(state, dispatch, view)
        : liftListItemCommand(state, dispatch, view);
    }
    const targets: { pos: number; indent: number | null }[] = [];
    forEachSelectedTextblock(state, (node, pos) => {
      if (!supports(node.type, 'indent') || findListItem(state.doc.resolve(pos))) return;
      const current = sanitizeIndent(node.attrs['indent']) ?? 0;
      const next = Math.min(MAX_INDENT, Math.max(0, current + delta));
      if (next !== current) targets.push({ pos, indent: next || null });
    });
    if (!targets.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { pos, indent } of targets) tr.setNodeAttribute(pos, 'indent', indent);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Indents the paragraphs and headings in the selection (`Mod-]`); nests list items in a list. */
export const indentCommand: Command = changeIndentCommand(1);

/** Outdents the paragraphs and headings in the selection (`Mod-[`); un-nests list items in a list. */
export const outdentCommand: Command = changeIndentCommand(-1);

/**
 * Backspace at the start of an indented paragraph or heading takes one
 * level of indent away instead of joining it with the block before, as in
 * word processors.
 */
export const outdentAtStartCommand: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const indent = sanitizeIndent($from.parent.attrs['indent']);
  if (!indent || findListItem($from)) return false;
  dispatch?.(state.tr.setNodeAttribute($from.before(), 'indent', indent - 1 || null));
  return true;
};

// ── Line spacing ──────────────────────────────────────────────────

/** The line spacing of the block at the selection head; null for the default. */
export function lineSpacingAt(state: EditorState): LineSpacing | null {
  return sanitizeLineSpacing(state.selection.$head.parent.attrs['lineSpacing']);
}

/**
 * Sets the line spacing of the paragraphs and headings in the selection;
 * null resets it to the default. Not applicable when the selection only
 * covers blocks without line spacing, such as code blocks.
 */
export function setLineSpacingCommand(spacing: LineSpacing | null): Command {
  const value = sanitizeLineSpacing(spacing);
  return (state, dispatch) => {
    const targets: number[] = [];
    forEachSelectedTextblock(state, (node, pos) => {
      if (supports(node.type, 'lineSpacing')) targets.push(pos);
    });
    if (!targets.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of targets) {
        if (tr.doc.nodeAt(pos)!.attrs['lineSpacing'] !== value) {
          tr.setNodeAttribute(pos, 'lineSpacing', value);
        }
      }
      dispatch(tr);
    }
    return true;
  };
}
