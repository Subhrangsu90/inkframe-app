/**
 * Photos and screenshots. GIFs (animated) and SVGs (no pixels) are kept as
 * they are, and so are animated PNG and WebP images.
 */
const SCALABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Whether the first bytes of an image hold `marker` (an animation chunk, for one). */
async function startsWith(blob: Blob, marker: string): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  const bytes = Array.from(marker, (c) => c.charCodeAt(0));
  for (let i = 0; i + bytes.length <= head.length; i++) {
    if (bytes.every((b, j) => head[i + j] === b)) return true;
  }
  return false;
}

/** Animated PNGs have an `acTL` chunk and animated WebPs an `ANIM` one, both near the start. */
function isAnimated(blob: Blob): Promise<boolean> {
  if (blob.type === 'image/png') return startsWith(blob, 'acTL');
  if (blob.type === 'image/webp') return startsWith(blob, 'ANIM');
  return Promise.resolve(false);
}

/** The image decoded, with its orientation (EXIF) applied as the browser shows it; null when it can't be. */
async function decode(blob: Blob): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The image scaled down to fit `maxDimension` pixels on its long side, in
 * its own format; the image itself when it is small enough, can't be
 * scaled (animations, vector images, browsers without a canvas), or would
 * not get smaller. Re-encoding also drops the photo's metadata, such as
 * where it was taken.
 */
export async function scaleDownImage(blob: Blob, maxDimension: number): Promise<Blob> {
  // No image decoding (the server, test environments): kept as it is.
  if (!SCALABLE_TYPES.has(blob.type) || typeof createImageBitmap === 'undefined') return blob;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.toBlob !== 'function') return blob;
  if (await isAnimated(blob)) return blob;

  const img = await decode(blob);
  if (!img) return blob;
  const scale = maxDimension / Math.max(img.naturalWidth, img.naturalHeight);
  if (!(scale < 1)) return blob;

  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const scaled = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, blob.type, blob.type === 'image/png' ? undefined : 0.9),
  );
  // Gives the pixels back now: Safari limits how much canvas memory a page holds.
  canvas.width = canvas.height = 0;
  // A browser that can't write the type (WebP, in older Safari) writes PNG instead.
  return scaled && scaled.type === blob.type && scaled.size < blob.size ? scaled : blob;
}
