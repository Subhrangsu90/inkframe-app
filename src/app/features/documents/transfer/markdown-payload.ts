import { DocJSON, markdownToDoc } from '@inkframe-ui/editor/core';

/**
 * A document from Markdown text, which share links held before they held
 * JSON. Its own module, loaded only for such links: the Markdown reader is
 * large, and the reader page should not download it for every link.
 */
export function markdownPayloadToDoc(text: string): DocJSON {
  return markdownToDoc(text).toJSON() as DocJSON;
}
