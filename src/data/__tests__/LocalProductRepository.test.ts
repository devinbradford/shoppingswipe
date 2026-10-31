import { CATEGORIES, generateCatalog, RETAILERS } from '../sample/catalog';
import { LocalProductRepository } from '../LocalProductRepository';

const catalog = generateCatalog();
const repo = new LocalProductRepository(catalog, CATEGORIES, RETAILERS);

describe('sample catalog', () => {
  it('has 144 obviously-fake products across 6 categories', async () => {
    expect(catalog).toHaveLength(144);
    const counts = await repo.countByCategory();
    expect(Object.values(counts)).toEqual([24, 24, 24, 24, 24, 24]);
    for (const p of catalog) expect(new URL(p.productUrl).hostname.endsWith('.example.com')).toBe(true);
    for (const r of RETAILERS) expect(r.domain.endsWith('.example.com')).toBe(true);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(144);
  });
});

describe('LocalProductRepository', () => {
  it('filters by category and excludes swiped ids', async () => {
    const all = await repo.listProducts({ categoryId: 'footwear' });
    const rest = await repo.listProducts({ categoryId: 'footwear', excludeIds: new Set([all[0].id]) });
    expect(all.every((p) => p.categoryId === 'footwear')).toBe(true);
    expect(rest).toHaveLength(all.length - 1);
  });

  it('searches across title, brand, retailer and tags (all words must match)', async () => {
    const target = catalog[10];
    const results = await repo.listProducts({ search: `${target.material} ${target.brand}` });
    expect(results.map((p) => p.id)).toContain(target.id);
    expect(await repo.listProducts({ search: 'zzzz-no-match' })).toEqual([]);
  });
});
