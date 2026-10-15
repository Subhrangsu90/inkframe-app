/** Decodes a `data:` URL into a Blob without fetch(). Returns null for anything else. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const type = match[1] || 'application/octet-stream';
  try {
    if (match[3]) {
      const binary = atob(match[4]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type });
    }
    return new Blob([decodeURIComponent(match[4])], { type });
  } catch {
    return null;
  }
}

/** Saves a file through a temporary download link. */
export function downloadFile(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A file name from a document title: characters that file systems reject
 * are removed (letters in any script are kept), and long titles shortened.
 */
export function safeFileName(title: string, extension: string, fallback = 'document'): string {
  const base = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100)
    .trim();
  return `${base || fallback}.${extension}`;
}
