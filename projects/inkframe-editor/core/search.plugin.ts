import { Command, EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
}

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  /** Index of the current match in `matches`, or -1 when there are none. */
  current: number;
  decorations: DecorationSet;
}

export const searchKey = new PluginKey<SearchState>('ink-search');

/** Highlighting more matches than this slows typing down without helping anyone. */
export const MAX_SEARCH_MATCHES = 2000;

const EMPTY: SearchState = {
  query: '',
  caseSensitive: false,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

type SearchMeta = Omit<SearchState, 'decorations'>;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds `query` in every textblock: paragraphs, headings, code blocks and the
 * paragraphs inside lists, callouts and table cells. A match never spans two
 * blocks. Inline nodes such as images count as one character, so text on
 * either side of them is not joined into a match.
 */
export function findMatches(doc: PMNode, query: string, options: SearchOptions = {}): SearchMatch[] {
  if (!query) return [];
  const pattern = new RegExp(escapeRegExp(query), options.caseSensitive ? 'g' : 'gi');
  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (matches.length >= MAX_SEARCH_MATCHES) return false;
    if (!node.isTextblock) return true;
    // Each leaf inline node becomes one placeholder character, so string
    // offsets equal document offsets inside the block.
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (const m of text.matchAll(pattern)) {
      const from = pos + 1 + m.index!;
      matches.push({ from, to: from + m[0].length });
      if (matches.length >= MAX_SEARCH_MATCHES) break;
    }
    return false;
  });
  return matches;
}

/** The first match at or after `pos`, wrapping around to the first match. */
function matchAtOrAfter(matches: SearchMatch[], pos: number): number {
  if (!matches.length) return -1;
  const index = matches.findIndex((m) => m.from >= pos);
  return index === -1 ? 0 : index;
}

function buildDecorations(doc: PMNode, matches: SearchMatch[], current: number): DecorationSet {
  if (!matches.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? 'ink-search-match ink-search-match-current' : 'ink-search-match',
      }),
    ),
  );
}

export function searchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchKey,
    state: {
      init: () => EMPTY,
      apply(tr, prev) {
        const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
        if (meta) {
          return meta.query
            ? { ...meta, decorations: buildDecorations(tr.doc, meta.matches, meta.current) }
            : { ...EMPTY, caseSensitive: meta.caseSensitive };
        }
        if (!tr.docChanged || !prev.query) return prev;

        // Edits while searching: search again and stay near the current match.
        const options = { caseSensitive: prev.caseSensitive };
        const matches = findMatches(tr.doc, prev.query, options);
        const anchor = prev.matches[prev.current];
        const current = matchAtOrAfter(matches, anchor ? tr.mapping.map(anchor.from, -1) : 0);
        return {
          query: prev.query,
          caseSensitive: prev.caseSensitive,
          matches,
          current,
          decorations: buildDecorations(tr.doc, matches, current),
        };
      },
    },
    props: {
      decorations: (state) => searchKey.getState(state)?.decorations,
    },
  });
}

export function getSearchState(state: EditorState): SearchState | undefined {
  return searchKey.getState(state);
}

/** Records the search result on `tr` and selects the current match, if any. */
function withSearch(tr: Transaction, meta: SearchMeta): Transaction {
  tr.setMeta(searchKey, meta);
  const match = meta.matches[meta.current];
  if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
  return tr;
}

/**
 * Searches for `query` (an empty query clears the search) and selects the
 * first match at or after the cursor.
 */
export function setSearchQueryCommand(query: string, options: SearchOptions = {}): Command {
  return (state, dispatch) => {
    if (!searchKey.getState(state)) return false;
    if (dispatch) {
      const caseSensitive = !!options.caseSensitive;
      const matches = findMatches(state.doc, query, { caseSensitive });
      const current = matchAtOrAfter(matches, state.selection.from);
      dispatch(withSearch(state.tr, { query, caseSensitive, matches, current }));
    }
    return true;
  };
}

function step(direction: 1 | -1): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    if (!search?.matches.length) return false;
    if (dispatch) {
      const { query, caseSensitive, matches } = search;
      const n = matches.length;
      const current = (search.current + direction + n) % n;
      dispatch(withSearch(state.tr, { query, caseSensitive, matches, current }));
    }
    return true;
  };
}

export const findNextCommand: Command = step(1);
export const findPreviousCommand: Command = step(-1);

/**
 * Replaces exactly the matched text. The replacement takes the marks of the
 * match's first character (so replacing a link's whole text keeps the link),
 * and an empty replacement deletes the text but never its block.
 */
function replaceMatch(tr: Transaction, { from, to }: SearchMatch, replacement: string): void {
  if (!replacement) {
    tr.delete(from, to);
    return;
  }
  const marks = tr.doc.nodeAt(from)?.marks;
  tr.replaceWith(from, to, tr.doc.type.schema.text(replacement, marks));
}

/** Replaces the current match and moves on to the next one. One undo step. */
export function replaceCurrentCommand(replacement: string): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    const match = search?.matches[search.current];
    if (!search || !match) return false;
    if (dispatch) {
      const { query, caseSensitive } = search;
      const tr = state.tr;
      replaceMatch(tr, match, replacement);
      const matches = findMatches(tr.doc, query, { caseSensitive });
      const current = matchAtOrAfter(matches, tr.mapping.map(match.to));
      dispatch(withSearch(tr, { query, caseSensitive, matches, current }));
    }
    return true;
  };
}

/** Replaces every match in one transaction (one undo step). */
export function replaceAllCommand(replacement: string): Command {
  return (state, dispatch) => {
    const search = searchKey.getState(state);
    if (!search?.matches.length) return false;
    if (dispatch) {
      const { query, caseSensitive } = search;
      const tr = state.tr;
      // Back to front, so earlier positions stay valid.
      for (let i = search.matches.length - 1; i >= 0; i--) {
        replaceMatch(tr, search.matches[i], replacement);
      }
      const matches = findMatches(tr.doc, query, { caseSensitive });
      tr.setMeta(searchKey, { query, caseSensitive, matches, current: matches.length ? 0 : -1 });
      dispatch(tr);
    }
    return true;
  };
}
