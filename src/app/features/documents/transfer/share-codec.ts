import { type StoredDoc, extractDocTitle } from '../data-access/document-manager';
import { SCHEMA_VERSION, imageStorage } from '@inkframe-ui/editor/core';

export interface DecodedSharedDoc {
  doc: StoredDoc;
  title: string;
}

/**
 * Converts a Uint8Array into a URL-safe Base64 string (no '+', '/', or '=').
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a URL-safe Base64 string back into a Uint8Array.
 */
export function base64UrlToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * The most a shared document may unpack to. A share link holds at most a
 * couple of megabytes, and real documents unpack to a few times that; a
 * crafted link could unpack to gigabytes and crash the tab.
 */
export const MAX_SHARED_DOC_BYTES = 32 * 1024 * 1024;

/**
 * Input goes into the stream this much at a time, so one step unpacks to at
 * most about 1000 times as much (deflate's limit), not the whole link at once.
 */
const STREAM_STEP = 4096;

/** Runs bytes through a compression stream. Null when the output passes `limit`. */
async function pipeBytes(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  // The stream takes the next piece only once the output so far is read.
  // Errors (damaged data, or stopping early) surface through the reader.
  for (let start = 0; start < bytes.length; start += STREAM_STEP) {
    writer.write(bytes.subarray(start, start + STREAM_STEP) as BufferSource).catch(() => undefined);
  }
  writer.close().catch(() => undefined);

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Compresses a document into a compact, zero-backend, URL-safe hash string.
 * Uses native Web Streams deflate-raw compression when available.
 */
export async function compressDocForSharing(storedDoc: StoredDoc, title?: string): Promise<string> {
  const inlinedDoc = await imageStorage.inlineDocImages(storedDoc, true);
  const docTitle = title || extractDocTitle(inlinedDoc) || 'Shared Document';
  const payload = JSON.stringify({
    t: docTitle,
    v: inlinedDoc.schemaVersion ?? SCHEMA_VERSION,
    d: inlinedDoc.doc,
  });

  const bytes = new TextEncoder().encode(payload);

  if (typeof CompressionStream !== 'undefined') {
    try {
      const compressed = await pipeBytes(bytes, new CompressionStream('deflate-raw'));
      return 'c_' + bytesToBase64Url(compressed!);
    } catch (e) {
      console.warn('CompressionStream failed, using base64url fallback:', e);
    }
  }

  return 'u_' + bytesToBase64Url(bytes);
}

/**
 * Decompresses and deserializes a shared document payload from a URL hash.
 */
export async function decompressSharedDoc(hash: string): Promise<DecodedSharedDoc | null> {
  if (!hash || hash === 'doc_default') {
    return null;
  }

  try {
    let jsonString = '';

    if (hash.startsWith('c_')) {
      // Compressed with deflate-raw
      const bytes = base64UrlToBytes(hash.slice(2));
      if (typeof DecompressionStream !== 'undefined') {
        const decompressed = await pipeBytes(
          bytes,
          new DecompressionStream('deflate-raw'),
          MAX_SHARED_DOC_BYTES,
        );
        if (!decompressed) {
          console.warn('This shared document unpacks to more than 32 MB; it was not opened.');
          return null;
        }
        jsonString = new TextDecoder().decode(decompressed);
      }
    } else if (hash.startsWith('u_')) {
      // Uncompressed base64url
      const bytes = base64UrlToBytes(hash.slice(2));
      jsonString = new TextDecoder().decode(bytes);
    } else {
      // Legacy or alternative base64 payload
      try {
        const bytes = base64UrlToBytes(hash);
        jsonString = new TextDecoder().decode(bytes);
      } catch {
        jsonString = decodeURIComponent(atob(hash));
      }
    }

    if (!jsonString) {
      return null;
    }

    // Try parsing as JSON
    const trimmed = jsonString.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const title = parsed.t || parsed.title || 'Shared Document';
      const docNode = parsed.d || parsed.doc;

      if (docNode) {
        return {
          title,
          doc: {
            schemaVersion: parsed.v || parsed.schemaVersion || SCHEMA_VERSION,
            doc: docNode,
          },
        };
      }
    }

    // Fallback: Check if raw markdown text
    if (trimmed) {
      const { markdownPayloadToDoc } = await import('./markdown-payload');
      const firstLine = trimmed
        .split('\n')[0]
        .replace(/^#+\s*/, '')
        .trim();
      return {
        title: firstLine || 'Shared Document',
        doc: {
          schemaVersion: SCHEMA_VERSION,
          doc: markdownPayloadToDoc(trimmed),
        },
      };
    }
  } catch (err) {
    console.warn('Failed to decompress shared document payload:', err);
  }

  return null;
}

/**
 * Builds a complete shareable URL for any document.
 *
 * The payload goes in the URL fragment (`/s#<payload>`), not the path: the
 * fragment is never sent to the server, so large documents (e.g. with inlined
 * images) don't hit server request-size limits (HTTP 431), and the document
 * content never appears in server logs.
 */
export async function buildShareableUrl(doc: StoredDoc, title?: string): Promise<string> {
  const hash = await compressDocForSharing(doc, title);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/s#${hash}`;
  }
  return `/s#${hash}`;
}
