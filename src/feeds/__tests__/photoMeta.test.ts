import { measurePhoto } from '../photoMeta';

/** A W×H RGB image filled with `bg`, with rectangles painted on top. */
function image(
  w: number,
  h: number,
  bg: number[],
  rects: { x: number; y: number; w: number; h: number; c: number[] }[] = [],
) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) px.set(bg, i * 3);
  for (const r of rects)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) px.set(r.c, (y * w + x) * 3);
  return px;
}
const WHITE = [255, 255, 255];
const GREY = [248, 248, 248];
const WOOD = [150, 110, 70];

describe('measurePhoto', () => {
  it('finds a sofa on a near-white background, with a small safety edge', () => {
    // 200×200 photo, sofa from x 20–180, y 70–130.
    const m = measurePhoto(image(200, 200, GREY, [{ x: 20, y: 70, w: 160, h: 60, c: WOOD }]), 200, 200);
    expect(m.kind).toBe('cutout');
    expect(m.bg).toBe('#F8F8F8');
    expect(m.ratio).toBe(1);
    const [x, y, w, h] = m.box!;
    expect(x).toBeCloseTo(0.08, 3);
    expect(y).toBeCloseTo(0.33, 3);
    expect(w).toBeCloseTo(0.84, 3);
    expect(h).toBeCloseTo(0.34, 3);
  });

  it('keeps thin legs and faint shadows inside the box', () => {
    const px = image(200, 200, WHITE, [
      { x: 60, y: 50, w: 80, h: 60, c: WOOD }, // body
      { x: 62, y: 110, w: 3, h: 40, c: WOOD }, // thin legs down to y 150
      { x: 135, y: 110, w: 3, h: 40, c: WOOD },
      { x: 50, y: 150, w: 100, h: 6, c: [225, 225, 225] }, // soft floor shadow to y 156
    ]);
    const [, y, , h] = measurePhoto(px, 200, 200).box!;
    expect(y + h).toBeGreaterThanOrEqual(156 / 200);
  });

  it('ignores a stray speck of dust', () => {
    const px = image(200, 200, WHITE, [
      { x: 60, y: 60, w: 80, h: 80, c: WOOD },
      { x: 10, y: 10, w: 1, h: 1, c: [0, 0, 0] },
    ]);
    const [x, y] = measurePhoto(px, 200, 200).box!;
    expect(x).toBeCloseTo(0.28, 3);
    expect(y).toBeCloseTo(0.28, 3);
  });

  it('treats room photos and coloured backgrounds as scenes (never trimmed)', () => {
    const room = new Uint8Array(100 * 100 * 3).map((_, i) => (i * 37) % 256);
    expect(measurePhoto(room, 100, 100)).toEqual({ ratio: 1, bg: expect.any(String), kind: 'scene' });
    const sage = image(100, 100, [200, 210, 190], [{ x: 30, y: 30, w: 40, h: 40, c: WOOD }]);
    expect(measurePhoto(sage, 100, 100).kind).toBe('scene');
    const dark = image(100, 100, [20, 20, 20], [{ x: 30, y: 30, w: 40, h: 40, c: WOOD }]);
    expect(measurePhoto(dark, 100, 100).kind).toBe('scene');
  });

  it('falls back to the whole photo when the furniture touches the edge', () => {
    const m = measurePhoto(image(200, 200, WHITE, [{ x: 40, y: 80, w: 160, h: 50, c: WOOD }]), 200, 200);
    expect(m).toMatchObject({ kind: 'cutout', note: 'touches-edge' });
    expect(m.box).toBeUndefined();
  });

  it('falls back when what it found is tiny (likely a logo) or nothing at all', () => {
    expect(measurePhoto(image(200, 200, WHITE, [{ x: 90, y: 90, w: 20, h: 20, c: WOOD }]), 200, 200)).toMatchObject({
      note: 'too-small',
    });
    expect(measurePhoto(image(200, 200, WHITE), 200, 200)).toMatchObject({ note: 'too-small' });
  });

  it('does not bother when the furniture already fills the photo', () => {
    const m = measurePhoto(image(200, 200, WHITE, [{ x: 6, y: 6, w: 188, h: 188, c: WOOD }]), 200, 200);
    expect(m).toMatchObject({ kind: 'cutout', note: 'no-gain' });
  });

  it('reads RGBA pixels and non-square photos', () => {
    const rgb = image(300, 150, WHITE, [{ x: 50, y: 30, w: 200, h: 80, c: WOOD }]);
    const rgba = new Uint8Array(300 * 150 * 4);
    for (let i = 0; i < 300 * 150; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
    const m = measurePhoto(rgba, 300, 150, 4);
    expect(m.ratio).toBe(2);
    expect(m.box).toEqual(measurePhoto(rgb, 300, 150).box);
  });
});
