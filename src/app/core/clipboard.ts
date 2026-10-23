/**
 * Copies text to the clipboard, including text still being made, such as a
 * share link. Throws when the browser refuses, or with the text's own error.
 *
 * Safari allows clipboard writes only during the click itself: waiting for
 * the text and then calling `writeText()` fails there. A ClipboardItem
 * accepts the text as a promise, so the write starts during the click.
 */
export async function copyText(text: string | Promise<string>): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard) {
    await text;
    throw new Error('This browser has no clipboard access.');
  }
  if (typeof text !== 'string' && typeof ClipboardItem !== 'undefined' && clipboard.write) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
    blob.catch(() => undefined); // awaiting `text` below reports it
    try {
      await clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return;
    } catch {
      // Older browsers take only finished data. If the text itself failed,
      // awaiting it below throws that error.
    }
  }
  await clipboard.writeText(await text);
}
