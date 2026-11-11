import { deckLayout, infoHeight } from '../deckLayout';

// Simulated phones: screen height, top of the photo lines (safe area + 4), tab bar height.
const SMALL = { height: 667, pipsTop: 24, bottomInset: 58 };
const STANDARD = { height: 852, pipsTop: 63, bottomInset: 84 };
const LARGE = { height: 932, pipsTop: 63, bottomInset: 84 };
const photoHeight = (l: ReturnType<typeof deckLayout>, h: number) => h - l.photoTop - l.photoBottom;

describe('infoHeight', () => {
  it('matches the details block as drawn (pill + two-line name + price row)', () => {
    // Measured in the app: 140 pt at default text, 174.6 at 150%, 184.6 at 200%.
    expect(infoHeight(1)).toBe(140);
    expect(infoHeight(1.5)).toBe(175);
    expect(infoHeight(2)).toBe(185);
  });

  it('never shrinks below the default size', () => {
    expect(infoHeight(0.85)).toBe(140);
    expect(infoHeight(0)).toBe(140);
  });
});

describe('deckLayout', () => {
  it('keeps the buttons exactly where they were', () => {
    for (const p of [SMALL, STANDARD, LARGE])
      expect(deckLayout({ ...p, fontScale: 1 }).actionsBottom).toBe(p.bottomInset + 16);
  });

  it('gives the details exactly the room they need, with a gap above them', () => {
    for (const fontScale of [1, 1.5, 2]) {
      const l = deckLayout({ ...STANDARD, fontScale });
      expect(l.photoBottom - l.infoBottom).toBeGreaterThanOrEqual(infoHeight(fontScale) + 12);
      expect(l.photoBottom - l.infoBottom).toBeLessThanOrEqual(infoHeight(fontScale) + 20);
    }
  });

  it('uses the roomy spacing on normal phones and gives the photo more room than before', () => {
    const std = deckLayout({ ...STANDARD, fontScale: 1 });
    expect(std.tight).toBe(false);
    // Before: photo area = height - (pipsTop + 64) - (bottomInset + 16 + 66 + 22 + 32 + 190).
    const before = STANDARD.height - (STANDARD.pipsTop + 64) - (STANDARD.bottomInset + 16 + 66 + 22 + 32 + 190);
    expect(photoHeight(std, STANDARD.height)).toBeGreaterThan(before + 40);
    expect(deckLayout({ ...SMALL, fontScale: 1 }).tight).toBe(false);
    expect(deckLayout({ ...LARGE, fontScale: 1 }).tight).toBe(false);
  });

  it('tightens decorative spacing first when the photo would get too small', () => {
    const roomyPhoto = 667 - (24 + 60) - (58 + 16 + 66 + 8 + 21 + 24 + infoHeight(1.5) + 20);
    const l = deckLayout({ ...SMALL, fontScale: 1.5 });
    expect(roomyPhoto).toBeLessThan(220);
    expect(l.tight).toBe(true);
    expect(photoHeight(l, SMALL.height)).toBeGreaterThan(roomyPhoto);
    // Text and buttons keep their full size: only spacing changed.
    expect(l.infoHeight).toBe(infoHeight(1.5));
    expect(l.actionsBottom).toBe(SMALL.bottomInset + 16);
  });

  it('keeps the same space above the buttons when their captions grow with larger text', () => {
    for (const fontScale of [1, 1.5, 2]) {
      const l = deckLayout({ ...STANDARD, fontScale });
      const caption = 8 + 14 * Math.min(fontScale, 2);
      expect(l.infoBottom - (l.actionsBottom + 66 + caption)).toBe(l.tight ? 16 : 24);
    }
  });

  it('never starts the photo under the header (12 + 44 pt below the progress lines)', () => {
    for (const p of [SMALL, STANDARD, LARGE])
      for (const fontScale of [1, 1.5, 2, 3]) {
        const l = deckLayout({ ...p, fontScale });
        expect(l.photoTop - p.pipsTop).toBeGreaterThanOrEqual(12 + 44 + 4);
      }
  });

  it('is the same for every card on a screen (depends only on screen and text size)', () => {
    expect(deckLayout({ ...STANDARD, fontScale: 1.2 })).toEqual(deckLayout({ ...STANDARD, fontScale: 1.2 }));
  });

  it('still leaves a photo area on the smallest screen at the largest text size', () => {
    const l = deckLayout({ ...SMALL, fontScale: 3 });
    expect(photoHeight(l, SMALL.height)).toBeGreaterThan(100);
  });
});
