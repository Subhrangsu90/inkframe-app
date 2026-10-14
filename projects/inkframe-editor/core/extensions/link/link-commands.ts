import { Command, EditorState } from 'prosemirror-state';
import { sanitizeHref } from './link-utils';

/** The href of the link at the cursor or in the selection, or null when there is none. */
export function linkHrefAt(state: EditorState): string | null {
  const linkMark = state.schema.marks['link'];
  if (!linkMark) return null;
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    const mark = linkMark.isInSet(state.storedMarks ?? $from.marks());
    return mark ? (mark.attrs['href'] as string) : null;
  }
  let href: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const mark = node.marks.find((m) => m.type === linkMark);
    if (mark) href = mark.attrs['href'] as string;
  });
  return href;
}

/**
 * Links the selection to `href`, or the text typed next when nothing is
 * selected. Fails when the URL's protocol is not allowed (see `sanitizeHref`).
 */
export function setLinkCommand(href: string): Command {
  return (state, dispatch) => {
    const safe = sanitizeHref(href);
    const linkMark = state.schema.marks['link'];
    if (!safe || !linkMark) return false;
    const { from, to, empty } = state.selection;
    const mark = linkMark.create({ href: safe });
    dispatch?.(
      empty
        ? state.tr.addStoredMark(mark)
        : state.tr.removeMark(from, to, linkMark).addMark(from, to, mark),
    );
    return true;
  };
}

/** Removes links from the selection. */
export const removeLinkCommand: Command = (state, dispatch) => {
  const linkMark = state.schema.marks['link'];
  if (!linkMark) return false;
  const { from, to } = state.selection;
  dispatch?.(state.tr.removeMark(from, to, linkMark));
  return true;
};
