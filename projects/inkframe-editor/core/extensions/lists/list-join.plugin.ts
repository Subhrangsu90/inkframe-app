import { Plugin, PluginKey } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { isHistoryTransaction } from 'prosemirror-history';
import { SKIP_LIST_JOIN, isListNode, joinAdjacentLists } from './list-commands';

export const listJoinKey = new PluginKey('list-join');

/**
 * Merges lists that an edit leaves next to each other: typing a list right
 * after another, pasting one, deleting the paragraph between two, or joining
 * the last paragraph between two lists into the first. Lists that were
 * already next to each other before the edit stay apart, so a list split on
 * purpose (restarted numbering) is never merged back by later typing. Undo
 * and redo are left alone so they restore the document exactly.
 */
export function listJoinPlugin(): Plugin {
  return new Plugin({
    key: listJoinKey,
    appendTransaction(transactions, oldState, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      if (transactions.some((tr) => tr.getMeta(SKIP_LIST_JOIN) || isHistoryTransaction(tr))) {
        return null;
      }

      // The top-level blocks around each change, in the final document.
      const maps = transactions.flatMap((tr) => tr.mapping.maps);
      const { doc } = state;
      const ranges: [number, number][] = [];
      maps.forEach((map, i) =>
        map.forEach((_oldStart, _oldEnd, from, to) => {
          for (let j = i + 1; j < maps.length; j++) {
            from = maps[j].map(from, -1);
            to = maps[j].map(to, 1);
          }
          const $from = doc.resolve(Math.min(from, doc.content.size));
          const $to = doc.resolve(Math.min(to, doc.content.size));
          ranges.push([
            $from.depth > 0 ? $from.before(1) : $from.pos,
            $to.depth > 0 ? $to.after(1) : $to.pos,
          ]);
        }),
      );
      if (!ranges.length) return null;

      ranges.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push([...range]);
      }

      // A boundary between two lists that already met before the edit is left alone.
      const toOld = new Mapping(maps).invert();
      const isNew = (boundary: number) => {
        const old = Math.max(0, Math.min(toOld.map(boundary), oldState.doc.content.size));
        const $old = oldState.doc.resolve(old);
        return !(isListNode($old.nodeBefore) && isListNode($old.nodeAfter));
      };

      const tr = state.tr;
      // Last range first, so joining never shifts a range still to be checked.
      for (let i = merged.length - 1; i >= 0; i--) {
        joinAdjacentLists(tr, merged[i][0], merged[i][1], isNew);
      }
      return tr.docChanged ? tr : null;
    },
  });
}
