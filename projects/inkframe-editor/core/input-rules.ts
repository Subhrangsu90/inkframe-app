import {
  inputRules,
  InputRule,
  wrappingInputRule,
  textblockTypeInputRule,
} from 'prosemirror-inputrules';
import { MarkType } from 'prosemirror-model';
import { schema } from './schema';
import { bulletListRule, orderedListRule, taskItemRule } from './lists/list-input-rules';

// The list rules moved to ./lists; kept here for code that imports them from this module.
export { bulletListRule, orderedListRule, taskItemRule } from './lists/list-input-rules';

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

export const buildInputRules = () => {
  const { heading, bullet_list, ordered_list, blockquote, code_block } = schema.nodes;
  const { strong, em, code, strikethrough, superscript, subscript } = schema.marks;

  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, heading, (m) => ({
        level: m[1].length,
      })),
      bulletListRule(bullet_list),
      orderedListRule(ordered_list),
      taskItemRule(),
      wrappingInputRule(/^\s*>\s$/, blockquote),
      textblockTypeInputRule(/^`{3}([a-z0-9_-]+)?\s$/, code_block, (m) => ({
        language: m[1]?.toLowerCase() || 'typescript',
      })),
      markRule(/\*\*([^*]+)\*\*$/, strong),
      markRule(/(?:^|\s)_([^_\s][^_]*)_$/, em),
      markRule(/~~([^~]+)~~$/, strikethrough),
      markRule(/\^([^^]+)\^$/, superscript),
      markRule(/~([^~]+)~$/, subscript),
      markRule(/`([^`]+)`$/, code),
    ],
  });
};
