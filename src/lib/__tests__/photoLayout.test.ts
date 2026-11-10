import type { PhotoMeta } from '@/domain/types';
import { CARD_MARGIN, metaFor, placePhoto } from '../photoLayout';

const cutout = (box: [number, number, number, number], ratio = 1): PhotoMeta => ({
  url: 'u',
  ratio,
  bg: '#F8F8F8',
  kind: 'cutout',
  box,
});

/** The furniture box as drawn on the card. */
function drawnBox(card: number, meta: PhotoMeta) {
  const p = placePhoto(card, meta.ratio, meta);
  const [bx, by, bw, bh] = meta.box!;
  return { x: p.left + bx * p.width, y: p.top + by * p.height, w: bw * p.width, h: bh * p.height, p };
}

describe('placePhoto', () => {
  it('shows the whole photo centred when nothing was measured', () => {
    expect(placePhoto(300, 1)).toEqual({ width: 300, height: 300, left: 0, top: 0, trimmed: false });
    expect(placePhoto(300, 2)).toEqual({ width: 300, height: 150, left: 0, top: 75, trimmed: false });
  });

  it('shows room photos whole', () => {
    const scene: PhotoMeta = { url: 'u', ratio: 1, bg: '#6A5C41', kind: 'scene' };
    expect(placePhoto(300, 1, scene).trimmed).toBe(false);
  });

  it('draws a cut-out larger, centred, with the breathing room on every side and nothing cut off', () => {
    const card = 358;
    for (const box of [
      [0.27, 0.18, 0.62, 0.72], // chair
      [0.1, 0.33, 0.8, 0.33], // sofa
      [0.15, 0.2, 0.7, 0.55], // bed
    ] as [number, number, number, number][]) {
      const b = drawnBox(card, cutout(box));
      const m = card * CARD_MARGIN - 0.001;
      expect(b.x).toBeGreaterThanOrEqual(m);
      expect(b.y).toBeGreaterThanOrEqual(m);
      expect(b.x + b.w).toBeLessThanOrEqual(card - m);
      expect(b.y + b.h).toBeLessThanOrEqual(card - m);
      // Touches the margin on its longer side (as large as allowed).
      expect(Math.max(b.w, b.h)).toBeCloseTo(card * (1 - 2 * CARD_MARGIN), 3);
      expect(b.p.trimmed).toBe(true);
    }
  });

  it('never makes a photo smaller than today, and never enlarges more than 2.5×', () => {
    expect(placePhoto(300, 1, cutout([0.05, 0.3, 0.9, 0.4])).trimmed).toBe(false);
    expect(placePhoto(300, 1, cutout([0.45, 0.45, 0.1, 0.1])).width).toBe(750);
  });

  it('uses a measurement only for the exact photo link it was made from', () => {
    const m = { ...cutout([0.2, 0.2, 0.6, 0.6]), url: 'a' };
    expect(metaFor(['a'], [m], 0)).toBe(m);
    expect(metaFor(['b'], [m], 0)).toBeNull();
    expect(metaFor(['a'], undefined, 0)).toBeNull();
  });
});
