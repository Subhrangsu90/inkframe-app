import {
  inputRules,
  InputRule,
  wrappingInputRule,
  textblockTypeInputRule,
} from 'prosemirror-inputrules';
import { MarkType } from 'prosemirror-model';
import { findWrapping } from 'prosemirror-transform';
import { schema } from './schema';

/** Wraps text matched by group 1 in a mark: **bold**, _italic_, `code`. */
function markRule(re: RegExp, type: MarkType): InputRule {
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

export function taskItemRule(): InputRule {
  return new InputRule(/^\s*\[([ xX]?)\]\s$/, (state, match, start, end) => {
    const isChecked = match[1].toLowerCase() === 'x';
    const { task_list, task_item } = schema.nodes;
    const tr = state.tr.delete(start, end);
    const $pos = tr.doc.resolve(tr.mapping.map(start));
    const range = $pos.blockRange();
    if (!range) return null;

    if ($pos.depth > 1 && $pos.node($pos.depth - 1).type === task_item) {
      const itemPos = $pos.before($pos.depth - 1);
      return tr.setNodeAttribute(itemPos, 'checked', isChecked);
    }

    const wrapping = findWrapping(range, task_list);
    if (!wrapping) return null;

    const wrappers = wrapping.map((w) =>
      w.type === task_item ? { type: w.type, attrs: { checked: isChecked } } : w,
    );

    return tr.wrap(range, wrappers);
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
      wrappingInputRule(/^\s*([-+*])\s$/, bullet_list),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        ordered_list,
        (m) => ({ order: +m[1] }),
        (m, node) => node.childCount + node.attrs['order'] === +m[1],
      ),
      taskItemRule(),
      wrappingInputRule(/^\s*>\s$/, blockquote),
      textblockTypeInputRule(/^`{3}$/, code_block),
      markRule(/\*\*([^*]+)\*\*$/, strong),
      markRule(/(?:^|\s)_([^_\s][^_]*)_$/, em),
      markRule(/~~([^~]+)~~$/, strikethrough),
      markRule(/\^([^^]+)\^$/, superscript),
      markRule(/~([^~]+)~$/, subscript),
      markRule(/`([^`]+)`$/, code),
    ],
  });
};
