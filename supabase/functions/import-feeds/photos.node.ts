/// <reference types="node" />
/**
 * Photo measuring for the GitHub Actions runner (Node only; the Edge Function doesn't do it).
 * Downloads a small copy of each product photo, decodes it with `sharp` and hands the pixels
 * to the pure `measurePhoto`. Photos are only read, never changed or re-hosted.
 *
 * `sharp` is not one of the app's packages: the workflow installs it into a temporary
 * folder and passes that folder as SHARP_DIR, so the phone app never includes it.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { measurePhoto, type MeasuredPhoto } from '../../../src/feeds/index.ts';

/** Longest side of the copy that gets measured (plenty for finding the furniture's edges). */
const SIZE = 400;
/** Refuse anything bigger than this (a broken link that serves a huge file). */
const MAX_BYTES = 15 * 1024 * 1024;

interface SharpImage {
  flatten(o: { background: string }): SharpImage;
  resize(w: number, h: number, o: { fit: 'inside'; withoutEnlargement: boolean }): SharpImage;
  removeAlpha(): SharpImage;
  raw(): SharpImage;
  toBuffer(o: {
    resolveWithObject: true;
  }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
}
type Sharp = (input: Buffer) => SharpImage;

/** Loads sharp from SHARP_DIR (or the normal places); null if it isn't installed. */
export function loadSharp(dir = process.env.SHARP_DIR): Sharp | null {
  try {
    const req = createRequire(join(dir || process.cwd(), 'noop.js'));
    return req('sharp') as Sharp;
  } catch {
    return null;
  }
}

/** Ask Shopify's image CDN for a small copy; other hosts get the original. The stored link is unchanged. */
export function smallCopyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'cdn.shopify.com' || u.pathname.includes('/cdn/shop/')) {
      u.searchParams.set('width', String(SIZE));
      return u.toString();
    }
  } catch {
    // Not a valid link: measured as-is (and will fail safely).
  }
  return url;
}

export function makePhotoMeasurer(sharp: Sharp) {
  return async (url: string): Promise<MeasuredPhoto | null> => {
    try {
      const res = await fetch(smallCopyUrl(url), {
        redirect: 'follow',
        headers: { 'User-Agent': 'CureAvo-feed-check/1.0' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
      const { data, info } = await sharp(buf)
        .flatten({ background: '#ffffff' })
        .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return measurePhoto(data, info.width, info.height, info.channels);
    } catch {
      // Couldn't download or read it: the app shows the whole photo.
      return null;
    }
  };
}
