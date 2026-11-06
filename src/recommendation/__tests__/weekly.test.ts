import type { Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import { computePriceBands } from '../engine';
import { affinity, buildTasteModel, EMPTY_MODEL } from '../model';
import { pickWeekly } from '../weekly';

const catalog = generateCatalog();
const products = new Map(catalog.map((p) => [p.id, p]));
const bands = computePriceBands(catalog);
const keep = (p: Product, at: number): SwipeEvent => ({
  id: `${p.id}@${at}`,
  productId: p.id,
  categoryId: p.categoryId,
  direction: 'keep',
  swipedAt: at,
});

describe('pickWeekly', () => {
  it('picks 10 with variety: at most 2 per type and 2 per brand', () => {
    const out = pickWeekly(catalog, EMPTY_MODEL, bands, 1);
    expect(out).toHaveLength(10);
    const count = (key: (p: Product) => string) => {
      const m = new Map<string, number>();
      for (const p of out) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
      return Math.max(...m.values());
    };
    expect(count((p) => p.subcategoryId)).toBeLessThanOrEqual(2);
    expect(count((p) => p.brand)).toBeLessThanOrEqual(2);
    expect(new Set(out.map((p) => p.id)).size).toBe(10);
  });

  it('is the same for the same inputs', () => {
    expect(pickWeekly(catalog, EMPTY_MODEL, bands, 7).map((p) => p.id)).toEqual(
      pickWeekly(catalog, EMPTY_MODEL, bands, 7).map((p) => p.id),
    );
  });

  it('leans toward what they love', () => {
    const others = catalog.filter((p) => p.material !== 'walnut');
    const swipes = [
      ...catalog
        .filter((p) => p.material === 'walnut')
        .slice(0, 8)
        .map((p, i) => keep(p, i)),
      ...others.slice(0, 12).map((p, i) => ({ ...keep(p, 100 + i), direction: 'skip' as const })),
    ];
    const model = buildTasteModel({ swipes, products, bands });
    expect(affinity(model, 'material:walnut').mean).toBeGreaterThan(0);
    const out = pickWeekly(catalog, model, bands, 1);
    const share = (ps: Product[]) => ps.filter((p) => p.material === 'walnut').length / ps.length;
    expect(share(out)).toBeGreaterThan(share(catalog) * 2);
  });

  it('returns fewer when the pool is small', () => {
    expect(pickWeekly(catalog.slice(0, 3), EMPTY_MODEL, bands, 1).length).toBeLessThanOrEqual(3);
  });
});
