/**
 * Version history:
 * - 1: initial schema.
 * - 2: `highlight` mark; `align` attribute on paragraphs and headings.
 * - 3: table cells lose the `height` attribute; rows fit their text.
 * - 4: list attributes (start number, bullet and number style, tight) shared
 *   by all list types; list items can start with a heading; `note` callouts.
 * - 5: `page` attribute on `doc`: the page setup (layout, paper, margins,
 *   page color); `page_break` blocks at the top level.
 */
export const SCHEMA_VERSION = 5;

/** The envelope that is saved to your database. */
export interface StoredDoc {
  schemaVersion: number;
  doc: unknown; // ProseMirror JSON
}

/**
 * A node in ProseMirror's JSON form (`Node.toJSON()`), for code that walks
 * stored documents without a schema. Nothing is validated: documents can come
 * from share links, so read attributes as `unknown`.
 */
export interface DocJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocJSON[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

type Migration = (doc: DocJSON) => DocJSON;

/** migrations[n] upgrades a document from version n to n + 1. */
const migrations: Record<number, Migration> = {
  // Only additions: version 1 documents are valid version 2 documents. The
  // bump makes older app versions refuse version 2 documents with a clear
  // "newer schema" error instead of failing on an unknown mark.
  1: (doc) => doc,
  2: dropCellHeights,
  // Only additions again: every version 3 document is a valid version 4 document.
  3: (doc) => doc,
  // A version 4 document has no page setup, which means Pageless.
  4: (doc) => doc,
};

/** Removes the fixed row height from table cells (version 2 to 3). */
function dropCellHeights(node: DocJSON): DocJSON {
  const copy: DocJSON = { ...node };
  if ((node.type === 'table_cell' || node.type === 'table_header') && node.attrs) {
    const { height: _height, ...attrs } = node.attrs;
    copy.attrs = attrs;
  }
  if (Array.isArray(node.content)) copy.content = node.content.map(dropCellHeights);
  return copy;
}

export function migrate(stored: StoredDoc): unknown {
  let version = stored.schemaVersion ?? 1;
  let doc = stored.doc as DocJSON;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Document is from a newer schema (v${version}); app supports v${SCHEMA_VERSION}`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from schema v${version}`);
    doc = step(doc);
    version++;
  }
  return doc;
}
