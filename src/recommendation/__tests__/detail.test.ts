import type { Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import { formatWhy, similarProducts, whyForYou } from '../detail';
import { computePriceBands } from '../engine';
import { buildTasteModel, EMPTY_MODEL } from '../model';

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

describe('whyForYou', () => {
  it('says nothing for a brand-new shopper', () => {
    const why = whyForYou(catalog[0], EMPTY_MODEL, bands);
    expect(why).toEqual({ labels: [], withinBudget: null });
    expect(formatWhy(why)).toBeNull();
  });

  it('names what they keep choosing', () => {
    const walnut = catalog.filter((p) => p.material === 'walnut');
    const others = catalog.filter((p) => p.material !== 'walnut' && !p.styleTags.includes('mid-century'));
    const swipes = [
      ...walnut.slice(0, 8).map((p, i) => keep(p, i)),
      ...others.slice(0, 12).map((p, i) => ({ ...keep(p, 100 + i), direction: 'skip' as const })),
    ];
    const model = buildTasteModel({ swipes, products, bands });
    const why = whyForYou(walnut[9], model, bands);
    expect(why.labels.length).toBeGreaterThan(0);
    expect(why.labels.some((l) => /walnut|mid-century/i.test(l))).toBe(true);
    expect(formatWhy(why)).toMatch(/^[A-Z]/);
  });

  it('mentions the budget only when it fits', () => {
    const sofas = catalog.filter((p) => p.subcategoryId === 'sofas').sort((a, b) => a.priceCents - b.priceCents);
    const statedBudget = { subcategoryId: 'sofas' as const, maxCents: sofas[Math.floor(sofas.length / 2)].priceCents };
    const model = buildTasteModel({ swipes: [], products, bands, statedBudget });
    expect(whyForYou(sofas[0], model, bands).withinBudget).toBe(true);
    expect(whyForYou(sofas.at(-1)!, model, bands).withinBudget).toBe(false);
    expect(formatWhy({ labels: [], withinBudget: false })).toBeNull();
    expect(formatWhy({ labels: [], withinBudget: true })).toBe('Within your budget');
  });
});

describe('similarProducts', () => {
  const target = catalog.find((p) => p.subcategoryId === 'sofas')!;

  it('returns look-alikes, mostly the same type, never the product itself', () => {
    const out = similarProducts(target, catalog, EMPTY_MODEL, bands);
    expect(out).toHaveLength(8);
    expect(out.map((p) => p.id)).not.toContain(target.id);
    expect(out.filter((p) => p.subcategoryId === target.subcategoryId).length).toBeGreaterThanOrEqual(5);
  });

  it('shares more of the look than random pieces do', () => {
    const keys = (p: Product) => new Set([...p.styleTags, p.material, p.color]);
    const overlap = (p: Product) => [...keys(p)].filter((k) => keys(target).has(k)).length;
    const out = similarProducts(target, catalog, EMPTY_MODEL, bands);
    const avg = (ps: Product[]) => ps.reduce((s, p) => s + overlap(p), 0) / ps.length;
    expect(avg(out)).toBeGreaterThan(avg(catalog.filter((p) => p.id !== target.id)));
  });

  it('skips excluded ids and caps each brand at two', () => {
    const first = similarProducts(target, catalog, EMPTY_MODEL, bands);
    const out = similarProducts(target, catalog, EMPTY_MODEL, bands, { excludeIds: new Set([first[0].id]) });
    expect(out.map((p) => p.id)).not.toContain(first[0].id);
    const brands = new Map<string, number>();
    for (const p of out) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
    expect(Math.max(...brands.values())).toBeLessThanOrEqual(2);
  });

  it('is empty when there is nothing else', () => {
    expect(similarProducts(target, [target], EMPTY_MODEL, bands)).toEqual([]);
  });
});
