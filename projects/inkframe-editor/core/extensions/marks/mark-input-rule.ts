import { InputRule } from 'prosemirror-inputrules';
import { MarkType } from 'prosemirror-model';

/** Wraps text matched by group 1 in a mark: **bold**, _italic_, `code`. */
export function markRule(re: RegExp, type: MarkType): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const inner = match[1];
    const lead = /^\s/.test(match[0]) ? 1 : 0; // some patterns capture one leading space
    const from = start + lead;
    return state.tr
      .delete(from, end)
      .insertText(inner, from)
      .addMark(from, from + inner.length, type.create())
      .removeStoredMark(type); // do not keep typing in the mark
  });
}
