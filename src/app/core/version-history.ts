import { Injectable } from '@angular/core';
import { StoredDoc } from '@inkframe-ui/editor/core';
import { extractDocText, extractDocTitle, extractDocWordCount } from './document-manager';
import {
  VersionMeta,
  VersionReason,
  deleteVersionContent,
  newVersionId,
  readVersionContent,
  readVersionList,
  writeVersionContent,
  writeVersionList,
} from './version-store';

export type { VersionMeta, VersionReason };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Automatic versions are taken at most this often while someone edits… */
export const SNAPSHOT_INTERVAL = 10 * MINUTE;
/** …or sooner, when the text grows or shrinks by this many characters. */
export const LARGE_CHANGE_CHARS = 2000;
/** One edit that removes this many characters, and a quarter of the text, saves the text it removed. */
export const LARGE_DELETION_CHARS = 200;
/** Automatic versions older than a day keep one per day, up to this age. */
export const RETENTION_DAYS = 30;

const dayKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * The versions to keep (the list is newest first): every named version; every
 * automatic version from the last 24 hours; then the newest automatic version
 * of each day for 30 days.
 */
export function retainedVersions(list: VersionMeta[], now: number): VersionMeta[] {
  const days = new Set<string>();
  return list.filter((version) => {
    if (version.name) return true;
    const age = now - version.createdAt;
    if (age < DAY) return true;
    if (age > RETENTION_DAYS * DAY) return false;
    const day = dayKey(version.createdAt);
    if (days.has(day)) return false;
    days.add(day);
    return true;
  });
}

/**
 * Version history of each document: automatic snapshots while editing, plus
 * versions saved by hand. Versions are stored on this device only.
 */
@Injectable({ providedIn: 'root' })
export class VersionHistory {
  /** Writes per document run one after another, so lists are never overwritten. */
  private readonly queues = new Map<string, Promise<unknown>>();

  private serialize<T>(docId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(docId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(docId, next);
    return next;
  }

  /** The document's versions, newest first. Drops versions past their retention. */
  list(docId: string): Promise<VersionMeta[]> {
    return this.serialize(docId, async () => this.prune(docId, await readVersionList(docId)));
  }

  get(versionId: string): Promise<StoredDoc | null> {
    return readVersionContent(versionId);
  }

  /** Saves `doc` as a version now. Throws a StorageError when storage refuses it. */
  snapshot(
    docId: string,
    doc: StoredDoc,
    reason: VersionReason,
    name?: string,
  ): Promise<VersionMeta> {
    return this.serialize(docId, async () => {
      const list = await readVersionList(docId);
      const meta = this.describe(docId, doc, reason, name);
      await writeVersionContent(meta.id, doc);
      await this.prune(docId, [meta, ...list], true);
      return meta;
    });
  }

  /**
   * Called after each save of a document's edits; takes automatic versions.
   * `previous` is the content before the edit. Snapshots are taken:
   * - of `previous`, when the document has no versions yet (so the text from
   *   before this editing session is kept) or the edit deleted a large part;
   * - of `next`, when the last version is 10 minutes old or the text changed
   *   by 2,000 characters since.
   */
  recordEdit(docId: string, previous: StoredDoc | null, next: StoredDoc): Promise<void> {
    return this.serialize(docId, async () => {
      const list = await readVersionList(docId);
      const added: { meta: VersionMeta; doc: StoredDoc }[] = [];
      const nextChars = extractDocText(next).length;

      if (previous) {
        const previousChars = extractDocText(previous).length;
        const removed = previousChars - nextChars;
        const largeDeletion = removed >= LARGE_DELETION_CHARS && removed >= previousChars * 0.25;
        if (list.length === 0 || largeDeletion) {
          const reason = largeDeletion ? 'before-deletion' : 'auto';
          added.push({ meta: this.describe(docId, previous, reason), doc: previous });
        }
      }

      const latest = added[0]?.meta ?? list[0];
      if (
        !latest ||
        Date.now() - latest.createdAt >= SNAPSHOT_INTERVAL ||
        Math.abs(nextChars - latest.chars) >= LARGE_CHANGE_CHARS
      ) {
        // Newest first: `next` is newer than `previous`.
        added.unshift({ meta: this.describe(docId, next, 'auto', undefined, 1), doc: next });
      }
      if (added.length === 0) return;

      for (const { meta, doc } of added) {
        await writeVersionContent(meta.id, doc);
      }
      await this.prune(docId, [...added.map((a) => a.meta), ...list], true);
    });
  }

  /** Deletes one version. */
  remove(docId: string, versionId: string): Promise<void> {
    return this.serialize(docId, async () => {
      const list = await readVersionList(docId);
      await writeVersionList(
        docId,
        list.filter((v) => v.id !== versionId),
      );
      await deleteVersionContent(versionId);
    });
  }

  /**
   * Adds versions with their original metadata (from a backup) to a
   * document's history. Versions with ids already in the history are skipped.
   */
  importVersions(docId: string, versions: { meta: VersionMeta; doc: StoredDoc }[]): Promise<void> {
    return this.serialize(docId, async () => {
      const list = await readVersionList(docId);
      const known = new Set(list.map((v) => v.id));
      const fresh = versions.filter((v) => !known.has(v.meta.id));
      if (fresh.length === 0) return;
      for (const { meta, doc } of fresh) {
        await writeVersionContent(meta.id, doc);
      }
      const merged = [...list, ...fresh.map((v) => ({ ...v.meta, docId }))];
      merged.sort((a, b) => b.createdAt - a.createdAt);
      await this.prune(docId, merged, true);
    });
  }

  private describe(
    docId: string,
    doc: StoredDoc,
    reason: VersionReason,
    name?: string,
    // Versions taken in the same instant still sort in the order they were taken.
    offsetMs = 0,
  ): VersionMeta {
    const meta: VersionMeta = {
      id: newVersionId(),
      docId,
      createdAt: Date.now() + offsetMs,
      title: extractDocTitle(doc),
      wordCount: extractDocWordCount(doc),
      chars: extractDocText(doc).length,
      reason,
    };
    const trimmed = name?.trim();
    if (trimmed) meta.name = trimmed;
    return meta;
  }

  /** Applies the retention rules; writes the list when it changed (or `force`). */
  private async prune(docId: string, list: VersionMeta[], force = false): Promise<VersionMeta[]> {
    const kept = retainedVersions(list, Date.now());
    if (kept.length !== list.length || force) {
      await writeVersionList(docId, kept);
      const keptIds = new Set(kept.map((v) => v.id));
      for (const version of list) {
        if (!keptIds.has(version.id)) await deleteVersionContent(version.id);
      }
    }
    return kept;
  }
}
