import { Command, TextSelection } from 'prosemirror-state';
import { PageSetup, normalizePageSetup, samePageSetup } from './page-setup';

/**
 * Sets the document's page setup in one transaction, so one undo step. Null
 * removes it (back to the defaults). Does nothing when the schema's `doc`
 * node has no `page` attribute or the setup is unchanged.
 */
export function setPageSetupCommand(setup: PageSetup | null): Command {
  return (state, dispatch) => {
    if (!('page' in (state.schema.topNodeType.spec.attrs ?? {}))) return false;
    const next = normalizePageSetup(setup);
    if (samePageSetup(normalizePageSetup(state.doc.attrs['page']), next)) return false;
    dispatch?.(state.tr.setDocAttribute('page', next));
    return true;
  };
}

/**
 * Inserts a page break (`Mod-Enter`, as in Word and Google Docs). In a
 * paragraph or heading at the top level it goes at the cursor: the text after
 * the cursor starts the new page. Anywhere else (lists, tables, quotes,
 * callouts) it goes after the top-level block that holds the cursor, since
 * page breaks are top-level blocks. Returns false in code blocks, where
 * `Mod-Enter` leaves the block instead.
 */
export const insertPageBreakCommand: Command = (state, dispatch) => {
  const pageBreak = state.schema.nodes['page_break'];
  const paragraph = state.schema.nodes['paragraph'];
  if (!pageBreak || !paragraph || state.selection.$from.parent.type.spec.code) return false;
  if (!dispatch) return true;

  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $pos = tr.selection.$from;
  let at: number;
  if ($pos.depth === 1 && $pos.parent.isTextblock) {
    if ($pos.parentOffset === 0) {
      at = $pos.before(1); // before the block; an empty line stays for typing
    } else if ($pos.parentOffset === $pos.parent.content.size) {
      at = $pos.after(1);
    } else {
      tr.split($pos.pos);
      at = $pos.pos + 1; // between the two halves
    }
  } else {
    at = $pos.depth === 0 ? $pos.pos : $pos.after(1);
  }
  tr.insert(at, pageBreak.create());

  // The cursor goes after the break, into a new line when nothing to type in follows.
  const after = at + 1; // a page break is a leaf: one position
  if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  dispatch(tr.scrollIntoView());
  return true;
};
