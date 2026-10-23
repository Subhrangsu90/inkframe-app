import { Injectable, inject } from '@angular/core';
import {
  DocJSON,
  SCHEMA_VERSION,
  StoredDoc,
  StoredImageMetadata,
  imageStorage,
  migrate,
  schema,
} from '@inkframe-ui/editor/core';
import { DocMeta, DocumentManager } from '../data-access/document-manager';
import { StorageHealth } from '../data-access/storage-health';
import { VersionHistory, VersionMeta } from '../versions/version-history';
import { dataUrlToBlob, downloadFile } from './data-url';
import { BACKUP_EXTENSION } from './file-types';

export { BACKUP_EXTENSION };
import { newVersionId } from '../versions/version-store';

export const BACKUP_FORMAT = 'inkframe-backup';
export const BACKUP_VERSION = 1;

export interface BackupVersion {
  meta: VersionMeta;
  doc: StoredDoc;
}

export interface BackupDocument {
  meta: DocMeta;
  doc: StoredDoc;
  versions: BackupVersion[];
}

export interface BackupImage extends StoredImageMetadata {
  /** The image as a `data:` URL. */
  data: string;
}

/**
 * The `.inkframe.json` file: every document with its version history, and
 * their images. Inkframe writes each document and each image on a line of
 * its own (see `BackupService.createFile`); it is JSON all the same.
 */
export interface InkframeBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  documents: BackupDocument[];
  images: BackupImage[];
}

/** A backup as read from a file. */
export interface ParsedBackup extends Omit<InkframeBackup, 'images'> {
  /** Document entries too damaged to read; they are left out of `documents`. */
  damaged: number;
  /** Reads the images from the file one at a time: all together may not fit in memory. */
  images(): AsyncIterable<BackupImage>;
}

/** `merge` adds to what is on this device; `replace` deletes it first. */
export type RestoreMode = 'merge' | 'replace';

export interface RestoreSummary {
  /** Documents restored under their own id. */
  added: number;
  /** Documents that differed from the copy on this device, restored as copies. */
  copies: number;
  /** Documents identical to the copy on this device. */
  unchanged: number;
  /** Documents that could not be read (damaged, or made by a newer Inkframe). */
  unreadable: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** For people: "Restored 4 documents, 1 as a copy. 2 documents already up to date." */
export function describeRestore(summary: RestoreSummary): string {
  const restored = summary.added + summary.copies;
  const parts = [
    restored === 0
      ? 'Nothing new to restore.'
      : `Restored ${plural(restored, 'document')}` +
        (summary.copies > 0
          ? `, ${summary.copies === 1 ? '1 as a copy' : `${summary.copies} as copies`}.`
          : '.'),
  ];
  if (summary.unchanged > 0) {
    parts.push(`${plural(summary.unchanged, 'document')} already up to date.`);
  }
  if (summary.unreadable > 0) {
    parts.push(`${plural(summary.unreadable, 'document')} could not be read.`);
  }
  return parts.join(' ');
}

/** A backup that cannot be restored. The message is written for people. */
export class BackupError extends Error {
  override readonly name = 'BackupError';
}

/** A document whose latest edits are not saved; backups include it as it is now. */
export interface UnsavedDoc {
  title: string;
  doc: StoredDoc;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStoredDoc = (value: unknown): value is StoredDoc =>
  isObject(value) && isObject(value['doc']) && typeof value['schemaVersion'] === 'number';

const isDocMeta = (value: unknown): value is DocMeta =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  value['id'] !== '' &&
  typeof value['title'] === 'string' &&
  typeof value['updatedAt'] === 'number' &&
  typeof value['createdAt'] === 'number';

const isVersion = (value: unknown): value is BackupVersion =>
  isObject(value) &&
  isStoredDoc(value['doc']) &&
  isObject(value['meta']) &&
  typeof value['meta']['id'] === 'string' &&
  typeof value['meta']['createdAt'] === 'number';

const isBackupImage = (value: unknown): value is BackupImage =>
  isObject(value) &&
  typeof value['id'] === 'string' &&
  typeof value['data'] === 'string' &&
  value['data'].startsWith('data:');

/** A document entry from a backup, or null when it is damaged. */
function readDocument(entry: unknown): BackupDocument | null {
  if (!isObject(entry) || !isDocMeta(entry['meta']) || !isStoredDoc(entry['doc'])) return null;
  const versions = Array.isArray(entry['versions']) ? entry['versions'].filter(isVersion) : [];
  return { meta: entry['meta'], doc: entry['doc'], versions };
}

/**
 * Checks what a file is and which version made it, from its top-level
 * fields. Throws a BackupError when it cannot be restored.
 */
function readHeader(data: unknown): { version: number; createdAt: number } {
  if (!isObject(data) || data['format'] !== BACKUP_FORMAT) {
    throw new BackupError('This file is not an Inkframe backup.');
  }
  const version = data['version'];
  if (typeof version !== 'number' || version > BACKUP_VERSION) {
    throw new BackupError(
      'This backup was made by a newer version of Inkframe. Update the app and try again.',
    );
  }
  if (!Array.isArray(data['documents'])) {
    throw new BackupError('This backup is damaged: it has no document list.');
  }
  return { version, createdAt: typeof data['createdAt'] === 'number' ? data['createdAt'] : 0 };
}

/** The line in a backup file between the last document and the first image. */
const IMAGES_LINE = '],"images":[';

/** A backup file is read this much at a time. */
const READ_SIZE = 1024 * 1024;

function joinBytes(pieces: Uint8Array[]): Uint8Array {
  if (pieces.length === 1) return pieces[0];
  const bytes = new Uint8Array(pieces.reduce((length, piece) => length + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.length;
  }
  return bytes;
}

/**
 * A file's lines from byte `start` on, each with the byte offset just past
 * it. Only a slice of the file is in memory at a time.
 */
async function* readLines(file: Blob, start = 0): AsyncGenerator<{ line: string; end: number }> {
  const decoder = new TextDecoder();
  let pieces: Uint8Array[] = [];
  for (let offset = start; offset < file.size; offset += READ_SIZE) {
    const chunk = new Uint8Array(await file.slice(offset, offset + READ_SIZE).arrayBuffer());
    let from = 0;
    for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, from)) {
      pieces.push(chunk.subarray(from, newline));
      yield { line: decoder.decode(joinBytes(pieces)), end: offset + newline + 1 };
      pieces = [];
      from = newline + 1;
    }
    pieces.push(chunk.subarray(from));
  }
  const rest = joinBytes(pieces);
  if (rest.length > 0) yield { line: decoder.decode(rest), end: file.size };
}

/** The entry on a line of a backup file (JSON, then a comma), or undefined when damaged. */
function readEntry(line: string): unknown {
  try {
    return JSON.parse(line.trimEnd().replace(/,$/, ''));
  } catch {
    return undefined;
  }
}

/** Whether this Inkframe can open the document. */
function isReadable(stored: StoredDoc): boolean {
  try {
    schema.nodeFromJSON(migrate(stored)).check();
    return true;
  } catch {
    return false;
  }
}

/** Ids of the stored images (`ink-idb:<id>`) a document shows. */
export function collectImageIds(stored: StoredDoc, into = new Set<string>()): Set<string> {
  const visit = (node: DocJSON | undefined) => {
    if (!node) return;
    const src = node.attrs?.['src'];
    if (node.type === 'image' && typeof src === 'string' && src.startsWith('ink-idb:')) {
      into.add(src.slice('ink-idb:'.length));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(stored?.doc as DocJSON | undefined);
  return into;
}

const sameContent = (a: StoredDoc, b: StoredDoc) =>
  a.schemaVersion === b.schemaVersion && JSON.stringify(a.doc) === JSON.stringify(b.doc);

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly docs = inject(DocumentManager);
  private readonly versions = inject(VersionHistory);
  /** Knows when the last backup was made, for the backup reminder. */
  private readonly health = inject(StorageHealth);

  /**
   * The backup file: every document, its version history and the images
   * they show. `unsaved` documents are included as they are in the editor,
   * for when storage refused their latest edits.
   *
   * The file is put together one document or image at a time, each on a
   * line of its own: as one string, a large library would not fit in a
   * phone's memory (nor, past a point, in any browser's), and `parse` can
   * then read it back a line at a time too.
   */
  async createFile(
    unsaved: ReadonlyMap<string, UnsavedDoc> = new Map(),
  ): Promise<{ file: Blob; createdAt: number }> {
    const createdAt = Date.now();
    const header = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt });
    // Each entry's text becomes a Blob of its own, so the text can be let go
    // before the next entry is made. Blob data lives outside the page's
    // JavaScript memory, and Chrome moves large amounts of it to disk.
    const parts: BlobPart[] = [`${header.slice(0, -1)},"documents":[\n`];
    // Entries in the current list, for the commas between them.
    let entries = 0;
    const addEntry = (entry: BackupDocument | BackupImage) =>
      parts.push(new Blob([(entries++ === 0 ? '' : ',\n') + JSON.stringify(entry)]));

    const index = await this.docs.getIndex();
    const pending = new Map(unsaved);
    const imageIds = new Set<string>();

    const add = async (meta: DocMeta, doc: StoredDoc) => {
      collectImageIds(doc, imageIds);
      const versions: BackupVersion[] = [];
      for (const version of await this.versions.list(meta.id)) {
        const content = await this.versions.get(version.id);
        if (!content) continue;
        collectImageIds(content, imageIds);
        versions.push({ meta: version, doc: content });
      }
      addEntry({ meta, doc, versions });
    };

    for (const meta of index) {
      const edited = pending.get(meta.id);
      pending.delete(meta.id);
      const doc = edited?.doc ?? (await this.docs.getDoc(meta.id));
      if (doc) await add(edited ? { ...meta, title: edited.title } : meta, doc);
    }
    // Unsaved documents that never reached the index (their first save failed).
    for (const [id, { title, doc }] of pending) {
      const now = Date.now();
      await add({ id, title, wordCount: 0, createdAt: now, updatedAt: now }, doc);
    }

    parts.push(`\n${IMAGES_LINE}\n`);
    entries = 0;
    for (const id of imageIds) {
      const image = await imageStorage.getImage(id);
      if (!image) continue;
      const data = await imageStorage.blobToDataUrl(image.blob);
      if (data) addEntry({ ...image.meta, data });
    }
    parts.push('\n]}\n');

    return { file: new Blob(parts, { type: 'application/json' }), createdAt };
  }

  /** Creates a backup and downloads it. Returns the file name. */
  async download(unsaved?: ReadonlyMap<string, UnsavedDoc>): Promise<string> {
    const { file, createdAt } = await this.createFile(unsaved);
    const date = new Date(createdAt);
    const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((n) => String(n).padStart(2, '0'))
      .join('-');
    const filename = `inkframe-backup-${stamp}${BACKUP_EXTENSION}`;
    downloadFile(file, filename);
    this.health.recordBackup(createdAt);
    return filename;
  }

  /**
   * Reads a backup file's documents; its images are read when restoring.
   * Throws a BackupError when the file is not a backup this version of
   * Inkframe understands. Damaged entries are dropped and counted.
   */
  async parse(file: Blob): Promise<ParsedBackup> {
    const head = await file.slice(0, 1024).text();
    const newline = head.indexOf('\n');
    const firstLine = newline === -1 ? '' : head.slice(0, newline).trimEnd();
    return firstLine.endsWith('"documents":[')
      ? this.parseLines(
          file,
          firstLine,
          new TextEncoder().encode(head.slice(0, newline)).length + 1,
        )
      : this.parseWhole(await file.text());
  }

  /** A backup as `createFile` writes it, read a line at a time from `start`. */
  private async parseLines(file: Blob, firstLine: string, start: number): Promise<ParsedBackup> {
    const { version, createdAt } = readHeader(readEntry(firstLine + ']}'));
    const documents: BackupDocument[] = [];
    let damaged = 0;
    let imagesStart = file.size;
    for await (const { line, end } of readLines(file, start)) {
      if (line.startsWith(']')) {
        if (line.trimEnd() === IMAGES_LINE) imagesStart = end;
        break;
      }
      if (!line.trim()) continue;
      const document = readDocument(readEntry(line));
      if (document) documents.push(document);
      else damaged++;
    }

    return {
      format: BACKUP_FORMAT,
      version,
      createdAt,
      documents,
      damaged,
      async *images() {
        try {
          for await (const { line } of readLines(file, imagesStart)) {
            if (line.startsWith(']')) return;
            const image = readEntry(line);
            if (isBackupImage(image)) yield image;
          }
        } catch (e) {
          // The file changed or went away since it was chosen. The documents
          // are already read, so they are restored without the rest of the images.
          console.warn('The images in the backup could not all be read:', e);
        }
      },
    };
  }

  /** A backup in any other layout, such as those made before Inkframe wrote them a line per entry. */
  private parseWhole(text: string): ParsedBackup {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new BackupError('This file is not an Inkframe backup.');
    }
    const { version, createdAt } = readHeader(data);
    const entries = data as { documents: unknown[]; images?: unknown };

    const documents: BackupDocument[] = [];
    let damaged = 0;
    for (const entry of entries.documents) {
      const document = readDocument(entry);
      if (document) documents.push(document);
      else damaged++;
    }
    const imageList = (Array.isArray(entries.images) ? entries.images : []).filter(isBackupImage);

    return {
      format: BACKUP_FORMAT,
      version,
      createdAt,
      documents,
      damaged,
      async *images() {
        yield* imageList;
      },
    };
  }

  /**
   * Restores a backup. `merge` never overwrites: a document that differs
   * from the one with the same id on this device is added as a copy titled
   * "… (restored)". `replace` deletes every document and image first.
   * Throws a BackupError, before changing anything, when nothing in the
   * backup can be restored.
   */
  async restore(backup: ParsedBackup, mode: RestoreMode): Promise<RestoreSummary> {
    const summary: RestoreSummary = {
      added: 0,
      copies: 0,
      unchanged: 0,
      unreadable: backup.damaged,
    };
    const readable = backup.documents.filter((entry) => {
      const ok = isReadable(entry.doc);
      if (!ok) summary.unreadable++;
      return ok;
    });
    if (readable.length === 0) {
      throw new BackupError(
        summary.unreadable > 0
          ? 'None of the documents in this backup can be opened. It may be damaged or made by a newer version of Inkframe.'
          : 'This backup has no documents.',
      );
    }

    if (mode === 'replace') await this.docs.clearAll();
    const existing = new Map((await this.docs.getIndex()).map((meta) => [meta.id, meta]));

    const toWrite: { entry: BackupDocument; meta: DocMeta; copy: boolean }[] = [];
    for (const entry of readable) {
      const local = existing.has(entry.meta.id) ? await this.docs.getDoc(entry.meta.id) : null;
      if (!local) {
        toWrite.push({ entry, meta: entry.meta, copy: false });
        summary.added++;
      } else if (sameContent(local, entry.doc)) {
        summary.unchanged++;
      } else {
        const meta = {
          ...entry.meta,
          id: this.docs.newDocId(),
          title: `${entry.meta.title} (restored)`,
        };
        toWrite.push({ entry, meta, copy: true });
        summary.copies++;
      }
    }

    // Images first, then versions, then documents: if storage fills up part
    // way, no restored document refers to an image that is missing.
    const imageIds = new Set<string>();
    for (const { entry } of toWrite) {
      collectImageIds(entry.doc, imageIds);
      entry.versions.forEach((v) => collectImageIds(v.doc, imageIds));
    }
    for await (const image of backup.images()) {
      if (!imageIds.has(image.id)) continue;
      if (mode === 'merge' && (await imageStorage.getImage(image.id))) continue;
      const blob = dataUrlToBlob(image.data);
      if (!blob) continue;
      const { data: _data, ...meta } = image;
      await imageStorage.putImage(
        {
          ...meta,
          name: typeof meta.name === 'string' ? meta.name : 'image',
          type: blob.type,
          size: blob.size,
          createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : Date.now(),
        },
        blob,
      );
    }

    for (const { entry, meta, copy } of toWrite) {
      const versions = entry.versions
        .filter((v) => v.doc.schemaVersion <= SCHEMA_VERSION)
        // A copy is a separate document: its versions get their own ids.
        .map((v) => ({ meta: { ...v.meta, id: copy ? newVersionId() : v.meta.id }, doc: v.doc }));
      await this.versions.importVersions(meta.id, versions);
    }

    await this.docs.putDocs(toWrite.map(({ meta, entry }) => ({ meta, doc: entry.doc })));
    // Everything here now came from the backup, so it is backed up as of then.
    if (mode === 'replace') this.health.recordBackup(backup.createdAt);
    return summary;
  }
}
