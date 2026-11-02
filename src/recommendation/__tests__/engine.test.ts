import type { CategoryId, Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import {
  buildTasteProfile,
  computePriceBands,
  DEFAULT_OPTIONS,
  EMPTY_PROFILE,
  formatReasons,
  reasonLabels,
  isColdStart,
  rankProducts,
  rerankQueue,
} from '../engine';

let n = 0;
function product(overrides: Partial<Product> = {}): Product {
  n++;
  return {
    id: `p${String(n).padStart(4, '0')}`,
    categoryId: 'furniture',
    retailerId: 'r1',
    title: 'Thing',
    brand: 'Brand',
    description: '',
    priceCents: 10000,
    currency: 'USD',
    imageUrls: [],
    productUrl: 'https://shop.example.com/x',
    styleTags: ['minimal'],
    material: 'oak',
    color: 'white',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function swipe(p: Product, direction: 'keep' | 'skip', swipedAt: number): SwipeEvent {
  return { productId: p.id, categoryId: p.categoryId, direction, swipedAt };
}

const byId = (ps: Product[]) => new Map(ps.map((p) => [p.id, p]));
const noExplore = { ...DEFAULT_OPTIONS, explorationRate: 0 };

describe('price bands', () => {
  it('splits each category into terciles', () => {
    const ps = [100, 200, 300, 400, 500, 600].map((c) => product({ priceCents: c }));
    expect(computePriceBands(ps).furniture).toEqual([300, 500]);
  });
});

describe('taste profile', () => {
  it('weights skips at 0.6x of keeps', () => {
    const a = product({ material: 'walnut' });
    const b = product({ material: 'steel' });
    // Same timestamp → same decay, so only the direction weight differs.
    const profile = buildTasteProfile(
      [swipe(a, 'keep', 1), swipe(b, 'skip', 1)],
      byId([a, b]),
      {},
      { ...DEFAULT_OPTIONS, halfLifeSwipes: 1e9 },
    );
    expect(profile.weights['material:walnut']).toBeCloseTo(0.5);
    expect(profile.weights['material:steel']).toBeCloseTo(-0.3);
    expect(profile.keepCount).toBe(1);
  });

  it('decays older swipes so recent ones count more', () => {
    const old = product({ color: 'rust' });
    const recent = product({ color: 'sage' });
    const filler = Array.from({ length: 40 }, () => product({ color: 'black' }));
    const swipes = [
      swipe(old, 'keep', 0),
      ...filler.map((f, i) => swipe(f, 'skip', i + 1)),
      swipe(recent, 'keep', 100),
    ];
    const profile = buildTasteProfile(swipes, byId([old, recent, ...filler]), {});
    expect(profile.weights['color:sage']).toBeGreaterThan(profile.weights['color:rust'] * 1.9);
  });

  it('ignores swipes for unknown products', () => {
    const profile = buildTasteProfile(
      [{ productId: 'gone', categoryId: 'decor', direction: 'keep', swipedAt: 1 }],
      new Map(),
      {},
    );
    expect(profile).toEqual(EMPTY_PROFILE);
  });
});

describe('ranking', () => {
  it('uses a varied cold-start mix until 3 keeps', () => {
    const kept = [product(), product()];
    const profile = buildTasteProfile(
      kept.map((p, i) => swipe(p, 'keep', i)),
      byId(kept),
      {},
    );
    expect(isColdStart(profile)).toBe(true);

    const candidates = ['minimal', 'minimal', 'rustic', 'rustic', 'vintage', 'vintage'].map((s) =>
      product({ styleTags: [s] }),
    );
    const ranked = rankProducts(candidates, profile, { bands: {}, seed: 1 });
    expect(ranked).toHaveLength(6);
    expect(ranked.every((r) => r.reasons.length === 0)).toBe(true);
    // No two neighbours share a primary style.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].product.styleTags[0]).not.toBe(ranked[i - 1].product.styleTags[0]);
    }
  });

  it('ranks products matching kept items first, with a reason', () => {
    const kept = Array.from({ length: 3 }, () => product({ styleTags: ['mid-century'], material: 'walnut' }));
    const skipped = Array.from({ length: 3 }, () => product({ styleTags: ['industrial'], material: 'steel' }));
    const swipes = [...kept.map((p, i) => swipe(p, 'keep', i)), ...skipped.map((p, i) => swipe(p, 'skip', 10 + i))];
    const profile = buildTasteProfile(swipes, byId([...kept, ...skipped]), {});

    const match = product({ styleTags: ['mid-century'], material: 'walnut' });
    const neutral = product({ styleTags: ['coastal'], material: 'rattan' });
    const disliked = product({ styleTags: ['industrial'], material: 'steel' });
    const ranked = rankProducts([disliked, neutral, match], profile, { bands: {}, seed: 1, options: noExplore });

    expect(ranked.map((r) => r.product.id)).toEqual([match.id, neutral.id, disliked.id]);
    expect(formatReasons(ranked[0].reasons)).toBe('Matches your taste for mid-century and walnut');
  });

  it('carries taste across categories', () => {
    const kept = Array.from({ length: 3 }, () =>
      product({ categoryId: 'furniture', material: 'walnut', color: 'walnut' }),
    );
    const profile = buildTasteProfile(
      kept.map((p, i) => swipe(p, 'keep', i)),
      byId(kept),
      {},
    );
    const decor = (material: string, color: string) => product({ categoryId: 'decor' as CategoryId, material, color });
    const ranked = rankProducts([decor('glass', 'white'), decor('walnut', 'walnut'), decor('brass', 'navy')], profile, {
      bands: {},
      seed: 3,
      options: noExplore,
    });
    expect(ranked[0].product.material).toBe('walnut');
  });

  it('explores roughly 15% of slots and is deterministic per seed', () => {
    const catalog = generateCatalog({ perCategory: 200, seed: 7 });
    const keeps = catalog.slice(0, 5).map((p, i) => swipe(p, 'keep', i));
    const profile = buildTasteProfile(keeps, byId(catalog), computePriceBands(catalog));
    const bands = computePriceBands(catalog);
    const a = rankProducts(catalog, profile, { bands, seed: 99 });
    const b = rankProducts(catalog, profile, { bands, seed: 99 });
    expect(a.map((r) => r.product.id)).toEqual(b.map((r) => r.product.id));
    const rate = a.filter((r) => r.explored).length / a.length;
    expect(rate).toBeGreaterThan(0.11);
    expect(rate).toBeLessThan(0.19);
  });

  it('re-ranks behind the two visible cards only', () => {
    const ps = Array.from({ length: 6 }, (_, i) => product({ material: i < 3 ? 'oak' : 'walnut' }));
    const queue = rankProducts(ps, EMPTY_PROFILE, { bands: {}, seed: 5 });
    const kept = Array.from({ length: 3 }, () => product({ material: 'walnut' }));
    const profile = buildTasteProfile(
      kept.map((p, i) => swipe(p, 'keep', i)),
      byId(kept),
      {},
    );
    const next = rerankQueue(queue, profile, { bands: {}, seed: 5, options: noExplore });

    expect(next.slice(0, 2).map((r) => r.product.id)).toEqual(queue.slice(0, 2).map((r) => r.product.id));
    expect(new Set(next.map((r) => r.product.id))).toEqual(new Set(queue.map((r) => r.product.id)));
    const tail = next.slice(2);
    const firstOak = tail.findIndex((r) => r.product.material === 'oak');
    const lastWalnut = tail.map((r) => r.product.material).lastIndexOf('walnut');
    expect(firstOak === -1 || lastWalnut === -1 || lastWalnut < firstOak).toBe(true);
  });

  it('ranks a 12k-product catalog quickly', () => {
    const catalog = generateCatalog({ perCategory: 2000 });
    expect(catalog).toHaveLength(12000);
    const bands = computePriceBands(catalog);
    const keeps = catalog
      .filter((_, i) => i % 97 === 0)
      .slice(0, 50)
      .map((p, i) => swipe(p, 'keep', i));
    const profile = buildTasteProfile(keeps, byId(catalog), bands);
    const start = Date.now();
    const ranked = rankProducts(catalog, profile, { bands, seed: 1 });
    expect(ranked).toHaveLength(12000);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe('formatReasons', () => {
  it('returns null with no reasons', () => {
    expect(formatReasons([])).toBeNull();
  });

  it('gives short labels for the "For you" bubble', () => {
    const reasons = [
      { kind: 'style' as const, value: 'mid-century', label: 'mid-century', key: 'style:mid-century' },
      { kind: 'price' as const, value: 'high', label: 'high', key: 'price:high' },
    ];
    expect(reasonLabels(reasons)).toEqual(['mid-century', 'premium pieces']);
  });
});
