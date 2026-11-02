import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from '../../data/sample/catalog';
import { LocalProductRepository } from '../../data/LocalProductRepository';
import { countActiveFilters, EMPTY_FILTERS, normalizePrice, parseDollars, toggleIn } from '../filters';

const catalog = generateCatalog();
const repo = new LocalProductRepository(catalog, CATEGORIES, SUBCATEGORIES, RETAILERS);

describe('search filters', () => {
  it('filters by category, retailer and price together', async () => {
    const filters = {
      categoryIds: ['bedroom' as const, 'living-room' as const],
      subcategoryIds: [],
      retailerIds: ['fern-fold'],
      minPriceCents: 10000,
      maxPriceCents: 100000,
    };
    const results = await repo.listProducts({ filters });
    expect(results.length).toBeGreaterThan(0);
    for (const p of results) {
      expect(['bedroom', 'living-room']).toContain(p.categoryId);
      expect(p.retailerId).toBe('fern-fold');
      expect(p.priceCents).toBeGreaterThanOrEqual(10000);
      expect(p.priceCents).toBeLessThanOrEqual(100000);
    }
    const expected = catalog.filter(
      (p) =>
        ['bedroom', 'living-room'].includes(p.categoryId) &&
        p.retailerId === 'fern-fold' &&
        p.priceCents >= 10000 &&
        p.priceCents <= 100000,
    );
    expect(results).toHaveLength(expected.length);
  });

  it('combines filters with search text', async () => {
    const all = await repo.listProducts({ search: 'walnut' });
    const cheap = await repo.listProducts({ search: 'walnut', filters: { ...EMPTY_FILTERS, maxPriceCents: 20000 } });
    expect(cheap.length).toBeLessThan(all.length);
    expect(cheap.every((p) => p.priceCents <= 20000)).toBe(true);
  });

  it('filters by product type', async () => {
    const results = await repo.listProducts({ filters: { ...EMPTY_FILTERS, subcategoryIds: ['sofas', 'rugs'] } });
    expect(results).toHaveLength(32);
    expect(results.every((p) => p.subcategoryId === 'sofas' || p.subcategoryId === 'rugs')).toBe(true);
  });

  it('counts active groups and fixes reversed price ranges', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, retailerIds: ['a', 'b'], minPriceCents: 1 })).toBe(2);
    expect(normalizePrice({ ...EMPTY_FILTERS, minPriceCents: 500, maxPriceCents: 100 })).toMatchObject({
      minPriceCents: 100,
      maxPriceCents: 500,
    });
  });

  it('parses dollar amounts', () => {
    expect(parseDollars('$1,250')).toBe(125000);
    expect(parseDollars('49.99')).toBe(4999);
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('abc')).toBeNull();
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});
