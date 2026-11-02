import type { Product, SwipeEvent } from '../../domain/types';
import { buildTasteProfile, DEFAULT_OPTIONS, formatReasons, isColdStart, rankProducts } from '../engine';

let n = 0;
function product(styleTags: string[], overrides: Partial<Product> = {}): Product {
  n++;
  return {
    id: `t${String(n).padStart(4, '0')}`,
    categoryId: 'living-room',
    subcategoryId: 'rugs',
    retailerId: 'r1',
    title: 'Thing',
    brand: 'Brand',
    description: '',
    priceCents: 5000,
    currency: 'USD',
    imageUrls: [],
    productUrl: 'https://shop.example.com/x',
    styleTags,
    material: 'oak',
    color: 'white',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
const noExplore = { ...DEFAULT_OPTIONS, explorationRate: 0 };
const byId = (ps: Product[]) => new Map(ps.map((p) => [p.id, p]));

describe('first-launch taste picker', () => {
  it('skips the cold start once 3 styles are picked', () => {
    expect(isColdStart(buildTasteProfile([], new Map(), {}))).toBe(true);
    expect(isColdStart(buildTasteProfile([], new Map(), {}, DEFAULT_OPTIONS, ['minimal', 'coastal']))).toBe(true);
    const seeded = buildTasteProfile([], new Map(), {}, DEFAULT_OPTIONS, ['minimal', 'coastal', 'vintage']);
    expect(isColdStart(seeded)).toBe(false);
    expect(seeded.keepCount).toBe(0);
  });

  it('ranks picked styles first, with a reason, before any swipes', () => {
    const profile = buildTasteProfile([], new Map(), {}, DEFAULT_OPTIONS, ['mid-century', 'scandinavian', 'minimal']);
    const candidates = [
      product(['industrial']),
      product(['maximalist']),
      product(['mid-century']),
      product(['rustic']),
      product(['scandinavian', 'minimal']),
    ];
    const ranked = rankProducts(candidates, profile, { bands: {}, seed: 1, options: noExplore });
    const topStyles = ranked.slice(0, 2).flatMap((r) => r.product.styleTags);
    expect(topStyles).toEqual(expect.arrayContaining(['mid-century', 'scandinavian']));
    expect(ranked.slice(2).every((r) => r.score === 0)).toBe(true);
    expect(formatReasons(ranked[0].reasons)).toMatch(/^Matches your taste for /);
  });

  it('lets real swipes take over from the picks over time', () => {
    const picks = ['minimal', 'coastal', 'scandinavian'];
    const kept = Array.from({ length: 60 }, () => product(['vintage']));
    const swipes: SwipeEvent[] = kept.map((p, i) => ({
      id: `k${i}`,
      productId: p.id,
      categoryId: p.categoryId,
      direction: 'keep',
      swipedAt: i,
    }));
    const profile = buildTasteProfile(swipes, byId(kept), {}, DEFAULT_OPTIONS, picks);
    expect(profile.weights['style:vintage']).toBeGreaterThan(5 * profile.weights['style:minimal']);

    const ranked = rankProducts([product(['minimal']), product(['vintage'])], profile, {
      bands: {},
      seed: 1,
      options: noExplore,
    });
    expect(ranked[0].product.styleTags).toEqual(['vintage']);
  });

  it('ignores duplicate picks and casing', () => {
    const a = buildTasteProfile([], new Map(), {}, DEFAULT_OPTIONS, ['Minimal', 'minimal', 'coastal']);
    expect(a.seeded).toBe(false);
    expect(Object.keys(a.weights).sort()).toEqual(['style:coastal', 'style:minimal']);
  });
});
