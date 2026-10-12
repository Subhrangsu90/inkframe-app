/**
 * Version history:
 * - 1: initial schema.
 * - 2: `highlight` mark; `align` attribute on paragraphs and headings.
 */
export const SCHEMA_VERSION = 2;

/** The envelope that is saved to your database. */
export interface StoredDoc {
  schemaVersion: number;
  doc: unknown; // ProseMirror JSON
}

type Migration = (doc: any) => any;

/** migrations[n] upgrades a document from version n to n + 1. */
const migrations: Record<number, Migration> = {
  // Only additions: version 1 documents are valid version 2 documents. The
  // bump makes older app versions refuse version 2 documents with a clear
  // "newer schema" error instead of failing on an unknown mark.
  1: (doc) => doc,
};

export function migrate(stored: StoredDoc): unknown {
  let version = stored.schemaVersion ?? 1;
  let doc = stored.doc;
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
