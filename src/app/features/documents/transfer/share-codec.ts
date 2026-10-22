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
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(bytes);
      writer.close();

      const chunks: Uint8Array[] = [];
      const reader = cs.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const compressed = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
      }

      return 'c_' + bytesToBase64Url(compressed);
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
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(bytes as unknown as BufferSource);
        writer.close();

        const chunks: Uint8Array[] = [];
        const reader = ds.readable.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
        const decompressed = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          decompressed.set(chunk, offset);
          offset += chunk.length;
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
