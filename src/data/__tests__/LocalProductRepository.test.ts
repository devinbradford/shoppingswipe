import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from '../sample/catalog';
import { LocalProductRepository } from '../LocalProductRepository';

const catalog = generateCatalog();
const repo = new LocalProductRepository(catalog, CATEGORIES, SUBCATEGORIES, RETAILERS);

describe('sample catalog', () => {
  it('is furniture only: 3 rooms, 11 product types, 16 each, all obviously fake', async () => {
    expect(catalog).toHaveLength(176);
    expect(CATEGORIES.map((c) => c.id)).toEqual(['bedroom', 'living-room', 'kitchen-dining']);
    const counts = await repo.countBySubcategory();
    expect(Object.values(counts)).toEqual(Array(11).fill(16));
    for (const p of catalog) {
      expect(new URL(p.productUrl).hostname.endsWith('.example.com')).toBe(true);
      const sub = SUBCATEGORIES.find((s) => s.id === p.subcategoryId);
      expect(sub?.categoryId).toBe(p.categoryId);
    }
    for (const r of RETAILERS) expect(r.domain.endsWith('.example.com')).toBe(true);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(176);
  });

  it('counts what is left to swipe per product type', async () => {
    const sofas = await repo.listProducts({ subcategoryId: 'sofas' });
    const left = await repo.countBySubcategory(new Set(sofas.slice(0, 5).map((p) => p.id)));
    expect(left.sofas).toBe(11);
    expect(left.rugs).toBe(16);
  });
});

describe('LocalProductRepository', () => {
  it('filters by room and excludes swiped ids', async () => {
    const all = await repo.listProducts({ categoryId: 'bedroom' });
    const rest = await repo.listProducts({ categoryId: 'bedroom', excludeIds: new Set([all[0].id]) });
    expect(all.every((p) => p.categoryId === 'bedroom')).toBe(true);
    expect(new Set(all.map((p) => p.subcategoryId))).toEqual(new Set(['bed-frames', 'nightstands', 'dressers']));
    expect(rest).toHaveLength(all.length - 1);
  });

  it('searches across title, brand, retailer and tags (all words must match)', async () => {
    const target = catalog[10];
    const results = await repo.listProducts({ search: `${target.material} ${target.brand}` });
    expect(results.map((p) => p.id)).toContain(target.id);
    expect(await repo.listProducts({ search: 'zzzz-no-match' })).toEqual([]);
  });
});
