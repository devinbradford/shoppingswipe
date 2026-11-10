/**
 * Where to draw a product photo inside its square studio card (the swipe card).
 * Pure arithmetic, so it's unit-tested and costs nothing while swiping.
 */
import type { PhotoMeta } from '@/domain/types';

/** Breathing room kept around cut-out furniture, as a share of the card on each side. */
export const CARD_MARGIN = 0.09;
/** Never enlarge a photo more than this, so it stays sharp. */
const MAX_ZOOM = 2.5;

export interface PhotoPlacement {
  /** The photo's drawn size and offset inside the card (the card clips anything outside). */
  width: number;
  height: number;
  left: number;
  top: number;
  /** True when the measured furniture box was used. */
  trimmed: boolean;
}

/**
 * Today's safe default is the whole photo, centred ("contain"). A cut-out with a measured
 * box is drawn larger so the furniture fills the card minus `CARD_MARGIN` on every side.
 * Only plain background lies outside the box, so nothing of the furniture is ever cut off.
 */
export function placePhoto(card: number, ratio: number, meta?: PhotoMeta | null): PhotoPlacement {
  const r = meta?.ratio || ratio || 1;
  // Whole photo, centred.
  const containW = r >= 1 ? card : card * r;
  const whole = { width: containW, height: containW / r, left: (card - containW) / 2, top: (card - containW / r) / 2 };
  const box = meta?.kind === 'cutout' ? meta.box : undefined;
  if (!box || card <= 0) return { ...whole, trimmed: false };

  const [bx, by, bw, bh] = box;
  const inner = card * (1 - 2 * CARD_MARGIN);
  // Photo width at which the box (bw × bh of the photo) just fits inside the inner area.
  let width = inner / Math.max(bw, bh / r);
  width = Math.min(width, containW * MAX_ZOOM);
  // Never smaller than today.
  if (width <= containW) return { ...whole, trimmed: false };
  const height = width / r;
  return {
    width,
    height,
    left: card / 2 - (bx + bw / 2) * width,
    top: card / 2 - (by + bh / 2) * height,
    trimmed: true,
  };
}

/** The meta for a photo, only if it was measured from this exact link. */
export function metaFor(urls: readonly string[], metas: readonly (PhotoMeta | null)[] | undefined, i: number) {
  const m = metas?.[i];
  return m && m.url === urls[i] ? m : null;
}
