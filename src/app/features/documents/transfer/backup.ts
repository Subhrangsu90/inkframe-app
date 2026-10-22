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

/** The `.inkframe.json` file: every document with its version history, and their images. */
export interface InkframeBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  documents: BackupDocument[];
  images: BackupImage[];
}

/** A backup as read from a file. */
export interface ParsedBackup extends InkframeBackup {
  /** Document entries too damaged to read; they are left out of `documents`. */
  damaged: number;
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
   * Collects every document, its version history and the images they show.
   * `unsaved` documents are included as they are in the editor, for when
   * storage refused their latest edits.
   */
  async create(unsaved: ReadonlyMap<string, UnsavedDoc> = new Map()): Promise<InkframeBackup> {
    const index = await this.docs.getIndex();
    const pending = new Map(unsaved);
    const imageIds = new Set<string>();
    const documents: BackupDocument[] = [];

    const add = async (meta: DocMeta, doc: StoredDoc) => {
      collectImageIds(doc, imageIds);
      const versions: BackupVersion[] = [];
      for (const version of await this.versions.list(meta.id)) {
        const content = await this.versions.get(version.id);
        if (!content) continue;
        collectImageIds(content, imageIds);
        versions.push({ meta: version, doc: content });
      }
      documents.push({ meta, doc, versions });
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

    const images: BackupImage[] = [];
    for (const id of imageIds) {
      const image = await imageStorage.getImage(id);
      if (!image) continue;
      const data = await imageStorage.blobToDataUrl(image.blob);
      if (data) images.push({ ...image.meta, data });
    }

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      documents,
      images,
    };
  }

  /** Creates a backup and downloads it. Returns the file name. */
  async download(unsaved?: ReadonlyMap<string, UnsavedDoc>): Promise<string> {
    const backup = await this.create(unsaved);
    const date = new Date(backup.createdAt);
    const stamp = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((n) => String(n).padStart(2, '0'))
      .join('-');
    const filename = `inkframe-backup-${stamp}${BACKUP_EXTENSION}`;
    downloadFile(new Blob([JSON.stringify(backup)], { type: 'application/json' }), filename);
    this.health.recordBackup(backup.createdAt);
    return filename;
  }

  /**
   * Reads a backup file. Throws a BackupError when the file is not a backup
   * this version of Inkframe understands. Damaged entries are dropped and
   * counted.
   */
  parse(text: string): ParsedBackup {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new BackupError('This file is not an Inkframe backup.');
    }
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

    const documents: BackupDocument[] = [];
    let damaged = 0;
    for (const entry of data['documents']) {
      if (!isObject(entry) || !isDocMeta(entry['meta']) || !isStoredDoc(entry['doc'])) {
        damaged++;
        continue;
      }
      const versions = Array.isArray(entry['versions']) ? entry['versions'].filter(isVersion) : [];
      documents.push({ meta: entry['meta'], doc: entry['doc'], versions });
    }

    const images = (Array.isArray(data['images']) ? data['images'] : []).filter(
      (image): image is BackupImage =>
        isObject(image) &&
        typeof image['id'] === 'string' &&
        typeof image['data'] === 'string' &&
        image['data'].startsWith('data:'),
    );

    return {
      format: BACKUP_FORMAT,
      version,
      createdAt: typeof data['createdAt'] === 'number' ? data['createdAt'] : 0,
      documents,
      images,
      damaged,
    };
  }

  /**
   * Restores a backup. `merge` never overwrites: a document that differs
   * from the one with the same id on this device is added as a copy titled
   * "… (restored)". `replace` deletes every document and image first.
   * Throws a BackupError, before changing anything, when nothing in the
   * backup can be restored.
   */
  async restore(
    backup: InkframeBackup & { damaged?: number },
    mode: RestoreMode,
  ): Promise<RestoreSummary> {
    const summary: RestoreSummary = {
      added: 0,
      copies: 0,
      unchanged: 0,
      unreadable: backup.damaged ?? 0,
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
    for (const image of backup.images) {
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
