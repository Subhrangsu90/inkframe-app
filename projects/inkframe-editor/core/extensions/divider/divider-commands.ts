import { Command } from 'prosemirror-state';

/** Replaces the selection with a horizontal rule. */
export const insertDividerCommand: Command = (state, dispatch) => {
  const rule = state.schema.nodes['horizontal_rule'];
  if (!rule) return false;
  dispatch?.(state.tr.replaceSelectionWith(rule.create()).scrollIntoView());
  return true;
};
