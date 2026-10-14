import { Command } from 'prosemirror-state';

/**
 * Replaces the selection with a table of `rows` × `cols` empty cells; the
 * first row is a header row. Does nothing when the schema has no tables.
 */
export function insertTableCommand(rows = 3, cols = 3): Command {
  return (state, dispatch) => {
    const { table, table_row, table_cell, table_header } = state.schema.nodes;
    if (!table || !table_row || !table_cell || !table_header) return false;
    const body = Array.from({ length: rows }, (_, r) =>
      table_row.create(
        null,
        Array.from({ length: cols }, () => (r === 0 ? table_header : table_cell).createAndFill()!),
      ),
    );
    dispatch?.(state.tr.replaceSelectionWith(table.create(null, body)).scrollIntoView());
    return true;
  };
}
