/**
 * Measuring a product photo, once, during the nightly import: is it furniture cut out
 * on a plain light background, or a room photo? For cut-outs, where exactly is the
 * furniture? The app uses this to draw cut-outs larger inside a studio card.
 *
 * Pure: takes already-decoded pixels (the runner decodes a small copy of the photo),
 * so it's unit-tested without any image library. Never changes the photo.
 */
import type { PhotoMeta } from '../domain/types';

export type MeasuredPhoto = Omit<PhotoMeta, 'url'>;

/** Outer ring of the photo that decides what "the background" is (fraction of the short side). */
const RING = 0.02;
/** A ring pixel matches the background if every channel is within this much of it. */
const RING_TOLERANCE = 12;
/** Share of the ring that must match for the photo to count as a cut-out. */
const RING_AGREEMENT = 0.9;
/** The background must be light (every channel at least this) and close to neutral. */
const LIGHT = 225;
const NEUTRAL_SPREAD = 12;
/** A pixel is part of the furniture if any channel differs from the background by more than this. */
const OBJECT_DIFF = 20;
/** A row or column only counts if this share of it differs (ignores stray specks and JPEG noise). */
const LINE_SHARE = 0.005;
/** Extra safety edge added around what was found (fraction of the photo). */
const SAFETY = 0.02;
/** Found something touching the photo's own edge: the retailer cropped it, so don't trim. */
const EDGE = 0.005;
/** Smaller than this share of the photo is more likely a logo than furniture. */
const MIN_AREA = 0.04;
/** Already this big in both directions: nothing worth gaining. */
const NO_GAIN = 0.9;

/**
 * @param px RGB or RGBA pixels, row by row (RGBA should already be flattened onto white).
 * @param channels 3 for RGB, 4 for RGBA.
 */
export function measurePhoto(px: ArrayLike<number>, width: number, height: number, channels = 3): MeasuredPhoto {
  const ratio = Math.round((width / height) * 1000) / 1000;
  const at = (x: number, y: number) => (y * width + x) * channels;

  // 1. The background: the typical colour of the outer ring, and how much of the ring agrees.
  const ring = Math.max(1, Math.round(RING * Math.min(width, height)));
  const samples: number[][] = [[], [], []];
  const visitRing = (fn: (i: number) => void) => {
    for (let y = 0; y < height; y++) {
      const edgeRow = y < ring || y >= height - ring;
      for (let x = 0; x < width; x++) if (edgeRow || x < ring || x >= width - ring) fn(at(x, y));
    }
  };
  visitRing((i) => {
    for (let c = 0; c < 3; c++) samples[c].push(px[i + c]);
  });
  const bg = samples.map((s) => median(s)) as [number, number, number];
  let agree = 0;
  let total = 0;
  visitRing((i) => {
    total++;
    if (diff(px, i, bg) <= RING_TOLERANCE) agree++;
  });
  const bgHex = toHex(bg);
  const light = Math.min(...bg) >= LIGHT && Math.max(...bg) - Math.min(...bg) <= NEUTRAL_SPREAD;
  if (agree / total < RING_AGREEMENT || !light) return { ratio, bg: bgHex, kind: 'scene' };

  // 2. Where the furniture is: rows and columns with enough pixels that differ from the background.
  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (diff(px, at(x, y), bg) > OBJECT_DIFF) {
        rows[y]++;
        cols[x]++;
      }
  const rowMin = Math.max(2, Math.ceil(LINE_SHARE * width));
  const colMin = Math.max(2, Math.ceil(LINE_SHARE * height));
  const y0 = rows.findIndex((n) => n >= rowMin);
  const x0 = cols.findIndex((n) => n >= colMin);
  if (y0 < 0 || x0 < 0) return { ratio, bg: bgHex, kind: 'cutout', note: 'too-small' };
  const y1 = height - [...rows].reverse().findIndex((n) => n >= rowMin);
  const x1 = width - [...cols].reverse().findIndex((n) => n >= colMin);

  // 3. Safety checks, then a small extra edge around it.
  const fx0 = x0 / width;
  const fy0 = y0 / height;
  const fx1 = x1 / width;
  const fy1 = y1 / height;
  if (fx0 <= EDGE || fy0 <= EDGE || fx1 >= 1 - EDGE || fy1 >= 1 - EDGE)
    return { ratio, bg: bgHex, kind: 'cutout', note: 'touches-edge' };
  if ((fx1 - fx0) * (fy1 - fy0) < MIN_AREA) return { ratio, bg: bgHex, kind: 'cutout', note: 'too-small' };
  const bx0 = Math.max(0, fx0 - SAFETY);
  const by0 = Math.max(0, fy0 - SAFETY);
  const bx1 = Math.min(1, fx1 + SAFETY);
  const by1 = Math.min(1, fy1 + SAFETY);
  if (bx1 - bx0 >= NO_GAIN && by1 - by0 >= NO_GAIN) return { ratio, bg: bgHex, kind: 'cutout', note: 'no-gain' };
  return { ratio, bg: bgHex, kind: 'cutout', box: [r4(bx0), r4(by0), r4(bx1 - bx0), r4(by1 - by0)] };
}

function diff(px: ArrayLike<number>, i: number, bg: readonly number[]): number {
  return Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2]));
}

function median(values: number[]): number {
  const counts = new Array<number>(256).fill(0);
  for (const v of values) counts[v]++;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v];
    if (seen * 2 >= values.length) return v;
  }
  return 255;
}

const toHex = (c: readonly number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
const r4 = (n: number) => Math.round(n * 10000) / 10000;
