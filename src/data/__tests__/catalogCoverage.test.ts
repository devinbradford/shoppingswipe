/**
 * P1-1 regression tests: the deck (and search) can reach every eligible product in the
 * catalog, not just the first 1,000 rows Supabase returns, without downloading the whole
 * catalog for each deck. Uses the fake PostgREST in ./fakePostgrest (1,000-row cap per request).
 */
import { EMPTY_FILTERS } from '@/domain/filters';
import { CANDIDATE_POOL_SIZE, ID_CHUNK } from '@/lib/candidatePool';
import { SupabaseProductRepository } from '../SupabaseProductRepository';
import { fakeCatalog, fakeDb, SERVER_MAX_ROWS, type FakeRow } from '../__fixtures__/fakePostgrest';

const ids = (n: number, from = 0) => new Set(Array.from({ length: n }, (_, i) => `p${String(from + i).padStart(6, '0')}`));

function repoFor(catalog: FakeRow[], opts?: { failOnRequest?: number }) {
  const fake = fakeDb(catalog, opts);
  return { repo: new SupabaseProductRepository(fake.db), requests: fake.requests };
}

/** Swipe through a deck batch by batch, the way the app does, until nothing eligible is left. */
async function drain(repo: SupabaseProductRepository, query: Parameters<SupabaseProductRepository['listCandidates']>[0]) {
  const seen: string[] = [];
  let batches = 0;
  for (;;) {
    const batch = await repo.listCandidates({ ...query, excludeIds: new Set(seen), seed: batches });
    batches++;
    seen.push(...batch.products.map((p) => p.id));
    if (batch.complete) return { seen, batches, lastBatch: batch };
    if (batch.products.length === 0) throw new Error('incomplete batch with nothing in it');
  }
}

describe('deck candidates reach the whole catalog', () => {
  it.each([
    [500, 500, true],
    [1000, 1000, true],
    [1937, CANDIDATE_POOL_SIZE, false],
    [5500, CANDIDATE_POOL_SIZE, false],
  ])('catalog of %i: first batch has %i products, complete = %s', async (size, expected, complete) => {
    const { repo } = repoFor(fakeCatalog(size));
    const batch = await repo.listCandidates({ seed: 1 });
    expect(batch.products).toHaveLength(expected);
    expect(batch.eligible).toBe(size);
    expect(batch.complete).toBe(complete);
  });

  it('draws from across the whole catalog, not the first 1,000 by id', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    const batch = await repo.listCandidates({ seed: 1 });
    const beyond = batch.products.filter((p) => p.id >= 'p001000');
    // 937 of 1,937 products sit past row 1,000; an even draw takes about 48% of its picks there.
    expect(beyond.length).toBeGreaterThan(400);
    expect(beyond.length).toBeLessThan(570);
  });

  it('every product, including the last by id, gets into a deck as the shopper swipes', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    const { seen, batches, lastBatch } = await drain(repo, {});
    expect(new Set(seen).size).toBe(1937);
    expect(seen).toHaveLength(1937); // no product offered twice across batches
    expect(seen).toContain('p001936');
    expect(batches).toBe(2);
    expect(lastBatch.complete).toBe(true);
  });

  it('works for catalogs well past 5,000 products', async () => {
    const { repo } = repoFor(fakeCatalog(5500));
    const { seen, batches } = await drain(repo, {});
    expect(new Set(seen).size).toBe(5500);
    expect(seen).toHaveLength(5500);
    expect(batches).toBe(6);
  });

  it('a different seed gives a different (but equally sized) pick; the same seed gives the same pick', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    const a = (await repo.listCandidates({ seed: 1 })).products.map((p) => p.id);
    const again = (await repo.listCandidates({ seed: 1 })).products.map((p) => p.id);
    const b = (await repo.listCandidates({ seed: 2 })).products.map((p) => p.id);
    expect(again).toEqual(a);
    expect(b).toHaveLength(a.length);
    expect(b).not.toEqual(a);
  });

  it('never returns swiped products', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    const swiped = ids(900);
    const batch = await repo.listCandidates({ excludeIds: swiped, seed: 3 });
    expect(batch.products.some((p) => swiped.has(p.id))).toBe(false);
    expect(batch.eligible).toBe(1037); // was 100 with the old query
    expect(batch.products).toHaveLength(1000);
  });

  it('copes with a very large swipe history (5,000 of 5,500 swiped)', async () => {
    const { repo, requests } = repoFor(fakeCatalog(5500));
    const swiped = ids(5000, 250);
    const batch = await repo.listCandidates({ excludeIds: swiped, seed: 4 });
    expect(batch.eligible).toBe(500);
    expect(batch.complete).toBe(true);
    expect(batch.products).toHaveLength(500);
    expect(batch.products.some((p) => swiped.has(p.id))).toBe(false);
    // The swipe history never goes into a URL, so request size stays small.
    expect(Math.max(...requests.map((r) => r.urlLength))).toBeLessThan(5000);
  });

  it('keeps room and product-type filters', async () => {
    const { repo } = repoFor(fakeCatalog(5500));
    const bedroom = await drain(repo, { categoryId: 'bedroom' });
    const sofas = await repo.listCandidates({ subcategoryId: 'sofas', seed: 1 });
    const all = fakeCatalog(5500);
    expect(bedroom.seen.length).toBe(all.filter((r) => r.category_id === 'bedroom').length);
    expect(sofas.products.length).toBe(all.filter((r) => r.subcategory_id === 'sofas').length);
    expect(sofas.products.every((p) => p.subcategoryId === 'sofas')).toBe(true);
  });

  it('keeps store and price filters', async () => {
    const { repo } = repoFor(fakeCatalog(5500));
    const filters = { ...EMPTY_FILTERS, retailerIds: ['r1'], minPriceCents: 20000, maxPriceCents: 50000 };
    const { seen } = await drain(repo, { filters });
    const expected = fakeCatalog(5500).filter(
      (r) => r.retailer_id === 'r1' && r.price_cents >= 20000 && r.price_cents <= 50000,
    );
    expect(new Set(seen)).toEqual(new Set(expected.map((r) => r.id)));
  });

  it('leaves out products switched off after the catalog index was read', async () => {
    const catalog = fakeCatalog(800);
    const { repo } = repoFor(catalog);
    await repo.getPriceBands(); // reads and caches the index
    catalog[5]!.is_active = false;
    const batch = await repo.listCandidates({ seed: 1 });
    expect(batch.products.some((p) => p.id === catalog[5]!.id)).toBe(false);
    expect(batch.products).toHaveLength(799);
  });

  it('fails the whole call if a request fails midway (no partial deck passed off as complete)', async () => {
    // 1,937 products: requests 1–2 read the index, then 7 batches of ids; the 5th request fails.
    const { repo } = repoFor(fakeCatalog(1937), { failOnRequest: 5 });
    await expect(repo.listCandidates({ seed: 1 })).rejects.toThrow('network down');
    // A failed index page isn't cached as a short catalog either.
    const indexFail = repoFor(fakeCatalog(1937), { failOnRequest: 2 });
    await expect(indexFail.repo.listCandidates({ seed: 1 })).rejects.toThrow('network down');
    await expect(indexFail.repo.listCandidates({ seed: 1 })).resolves.toMatchObject({ eligible: 1937 });
  });

  it('says "complete" only once nothing eligible is left', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    expect((await repo.listCandidates({ excludeIds: ids(936), seed: 1 })).complete).toBe(false); // 1,001 left
    const last = await repo.listCandidates({ excludeIds: ids(937), seed: 1 }); // exactly 1,000 left
    expect(last.complete).toBe(true);
    expect(last.products).toHaveLength(1000);
    const none = await repo.listCandidates({ excludeIds: ids(1937), seed: 1 });
    expect(none).toMatchObject({ products: [], eligible: 0, complete: true });
  });

  it('stays bounded: requests and rows per deck load', async () => {
    const { repo, requests } = repoFor(fakeCatalog(1937));
    await repo.listCandidates({ seed: 1 });
    const index = requests.filter((r) => !r.columns.includes('title'));
    const full = requests.filter((r) => r.columns.includes('title'));
    expect(index).toHaveLength(2); // light index: 1,937 small rows in 2 pages (cached 5 min)
    expect(full).toHaveLength(Math.ceil(CANDIDATE_POOL_SIZE / ID_CHUNK)); // 7
    expect(full.reduce((n, r) => n + r.rows, 0)).toBe(CANDIDATE_POOL_SIZE);
    expect(Math.max(...full.map((r) => r.urlLength))).toBeLessThan(5000);
    // A second deck within 5 minutes re-uses the index.
    await repo.listCandidates({ seed: 2, categoryId: 'bedroom' });
    expect(requests.filter((r) => !r.columns.includes('title'))).toHaveLength(2);
  });
});

describe('listProducts (search, weekly fallbacks, More like this)', () => {
  it.each([500, 1000, 1937, 5500])('catalog of %i: returns up to 1,000 and can page past row 1,000', async (size) => {
    const { repo } = repoFor(fakeCatalog(size));
    const first = await repo.listProducts();
    expect(first).toHaveLength(Math.min(size, 1000));
    const big = await repo.listProducts({ limit: 5000 });
    expect(big).toHaveLength(Math.min(size, 5000));
    expect(new Set(big.map((p) => p.id)).size).toBe(big.length); // no duplicates across pages
  });

  it('swiped products no longer use up the limit (900 swiped of 1,937: was 100, now 1,000)', async () => {
    const { repo } = repoFor(fakeCatalog(1937));
    const swiped = ids(900);
    const out = await repo.listProducts({ excludeIds: swiped });
    expect(out).toHaveLength(1000);
    expect(out.some((p) => swiped.has(p.id))).toBe(false);
  });

  it('keeps search, room, store and price filters across pages', async () => {
    const { repo } = repoFor(fakeCatalog(5500));
    const all = fakeCatalog(5500);
    const oak = await repo.listProducts({ search: 'oak', limit: 5000 });
    expect(oak).toHaveLength(all.filter((r) => r.title.toLowerCase().includes('oak')).length);
    const filters = { ...EMPTY_FILTERS, categoryIds: ['living-room' as const], retailerIds: ['r2'], maxPriceCents: 30000 };
    const filtered = await repo.listProducts({ filters, limit: 5000 });
    expect(filtered.length).toBe(
      all.filter((r) => r.category_id === 'living-room' && r.retailer_id === 'r2' && r.price_cents <= 30000).length,
    );
  });

  it('a small limit stays a small request', async () => {
    const { repo, requests } = repoFor(fakeCatalog(1937));
    await repo.listProducts({ subcategoryId: 'sofas', limit: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.rows).toBe(1);
  });

  it('fails rather than returning a partial list when a page fails', async () => {
    const { repo } = repoFor(fakeCatalog(5500), { failOnRequest: 2 });
    await expect(repo.listProducts({ excludeIds: ids(1500) })).rejects.toThrow('network down');
  });
});

describe('getProducts with long histories', () => {
  it('returns all 2,500 swiped products in order (one request would be cut off at 1,000)', async () => {
    const { repo, requests } = repoFor(fakeCatalog(5500));
    const wanted = [...ids(2500, 3000)].reverse();
    const got = await repo.getProducts(wanted);
    expect(got.map((p) => p.id)).toEqual(wanted);
    expect(Math.max(...requests.map((r) => r.rows))).toBeLessThanOrEqual(SERVER_MAX_ROWS);
    expect(Math.max(...requests.map((r) => r.urlLength))).toBeLessThan(5000);
  });

  it('fails as a whole if one batch fails', async () => {
    const { repo } = repoFor(fakeCatalog(5500), { failOnRequest: 3 });
    await expect(repo.getProducts([...ids(2500)])).rejects.toThrow('network down');
  });
});
