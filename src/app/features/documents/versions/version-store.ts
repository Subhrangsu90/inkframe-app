import { StoredDoc, imageStorage } from '@inkframe-ui/editor/core';

/** Why a version was saved. Versions with a name were saved by hand. */
export type VersionReason = 'auto' | 'named' | 'before-restore' | 'before-deletion';

export interface VersionMeta {
  id: string;
  docId: string;
  createdAt: number;
  title: string;
  wordCount: number;
  /** Length of the plain text, to notice large changes without loading the content. */
  chars: number;
  reason: VersionReason;
  /** Set on versions saved by hand. They are never removed automatically. */
  name?: string;
}

/**
 * Versions are stored next to documents: one list of metadata per document
 * (newest first) and one record per version holding its content, so the
 * list loads without the content.
 */
export const VERSION_KEY_PREFIX = 'inkframe_version';
const listKey = (docId: string) => `${VERSION_KEY_PREFIX}s_${docId}`;
const contentKey = (versionId: string) => `${VERSION_KEY_PREFIX}_${versionId}`;

export function newVersionId(): string {
  return 'ver_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

export async function readVersionList(docId: string): Promise<VersionMeta[]> {
  const list = await imageStorage.getDocument<VersionMeta[]>(listKey(docId));
  return Array.isArray(list) ? list : [];
}

/** Throws a StorageError when storage refuses the write. */
export async function writeVersionList(docId: string, list: VersionMeta[]): Promise<void> {
  if (list.length === 0) {
    await imageStorage.deleteDocument(listKey(docId));
  } else {
    await imageStorage.saveDocument(listKey(docId), list);
  }
}

export function readVersionContent(versionId: string): Promise<StoredDoc | null> {
  return imageStorage.getDocument<StoredDoc>(contentKey(versionId));
}

/** Throws a StorageError when storage refuses the write. */
export function writeVersionContent(versionId: string, doc: StoredDoc): Promise<void> {
  return imageStorage.saveDocument(contentKey(versionId), doc);
}

export function deleteVersionContent(versionId: string): Promise<void> {
  return imageStorage.deleteDocument(contentKey(versionId));
}

/** Removes a document's whole version history. */
export async function deleteVersions(docId: string): Promise<void> {
  for (const version of await readVersionList(docId)) {
    await deleteVersionContent(version.id);
  }
  await imageStorage.deleteDocument(listKey(docId));
}
