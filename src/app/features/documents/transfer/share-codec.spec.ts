import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  compressDocForSharing,
  decompressSharedDoc,
  bytesToBase64Url,
  buildShareableUrl,
  base64UrlToBytes,
} from './share-codec';
import { StoredDoc } from '../data-access/document-manager';

describe('share-codec', () => {
  it('correctly converts bytes to base64url and back', () => {
    const original = new Uint8Array([1, 2, 3, 250, 255, 0, 42]);
    const encoded = bytesToBase64Url(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    const restored = base64UrlToBytes(encoded);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('compresses and decompresses a document round-trip losslessly', async () => {
    const mockDoc: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Zero Backend Sharing ✦' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'This document is compressed with deflate-raw and embedded in the URL!',
              },
            ],
          },
        ],
      },
    };

    const hash = await compressDocForSharing(mockDoc, 'Zero Backend Sharing ✦');
    expect(hash.startsWith('c_') || hash.startsWith('u_')).toBe(true);

    const decoded = await decompressSharedDoc(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.title).toBe('Zero Backend Sharing ✦');
    expect(decoded!.doc.schemaVersion).toBe(1);
    expect(decoded!.doc.doc).toEqual(mockDoc.doc);
  });

  it('returns null for empty or invalid hash', async () => {
    expect(await decompressSharedDoc('')).toBeNull();
    expect(await decompressSharedDoc('doc_default')).toBeNull();
  });

  it('handles documents with images safely during sharing', async () => {
    const mockDocWithImage: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Document with image' }],
          },
          {
            type: 'image',
            attrs: {
              src: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600',
              alt: 'Sample Artwork',
              title: 'Art',
            },
          },
        ],
      },
    };

    const hash = await compressDocForSharing(mockDocWithImage, 'Image Document');
    const decoded = await decompressSharedDoc(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.title).toBe('Image Document');
    const content = (decoded!.doc.doc as { content: any[] }).content;
    expect(content[1]['type']).toBe('image');
    expect(content[1]['attrs']['src']).toContain('https://images.unsplash.com');
  });
});

describe('buildShareableUrl', () => {
  it('puts the payload in the URL fragment so it is never sent to the server', async () => {
    const doc: StoredDoc = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50000) }] }],
      },
    };
    const url = new URL(await buildShareableUrl(doc, 'Big'));
    expect(url.pathname).toBe('/s');
    expect(url.search).toBe('');
    const decoded = await decompressSharedDoc(url.hash.slice(1));
    expect(decoded?.title).toBe('Big');
    expect(decoded?.doc.doc).toEqual(doc.doc);
  });
});
