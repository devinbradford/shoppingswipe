/**
 * P1-2: saved products the catalog stops returning. The Supabase fake hides inactive rows the
 * way the database's read rule does (`using (is_active)`); the local repository is tested
 * separately. Each lookup here is what `useAvailability` does: getProducts, then split.
 */
import { savedNow, splitAvailability, unavailablePrice, type SnapshotMap } from '@/domain/availability';
import { shareListText } from '@/domain/board';
import { formatPrice } from '@/lib/format';
import { productFromRow } from '@/lib/rows';
import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from '../sample/catalog';
import { LocalProductRepository } from '../LocalProductRepository';
import { SupabaseProductRepository } from '../SupabaseProductRepository';
import { fakeCatalog, fakeDb } from '../__fixtures__/fakePostgrest';

function setup() {
  const catalog = fakeCatalog(20);
  const fake = fakeDb(catalog);
  const repo = new SupabaseProductRepository(fake.db);
  const kept = [
    { productId: catalog[3]!.id, savedAt: 300 },
    { productId: catalog[7]!.id, savedAt: 200 },
    { productId: catalog[9]!.id, savedAt: 100 },
  ];
  // Snapshots taken when each was kept.
  const snapshots: Record<string, ReturnType<typeof savedNow>> = {};
  for (const k of kept) {
    const row = catalog.find((r) => r.id === k.productId)!;
    snapshots[k.productId] = savedNow(undefined, productFromRow(row), k.savedAt, k.savedAt);
  }
  const lookup = async (snaps: SnapshotMap = snapshots) =>
    splitAvailability(kept, await repo.getProducts(kept.map((k) => k.productId)), snaps);
  return { catalog, fake, repo, kept, snapshots, lookup };
}

describe('Supabase: kept products that stop being sold', () => {
  it('active → inactive → active again, with the right prices each time', async () => {
    const { catalog, lookup, snapshots } = setup();
    const row = catalog[7]!;
    const savedPrice = row.price_cents;
    expect((await lookup()).unavailable).toEqual([]);

    row.is_active = false; // the nightly import stopped seeing it
    const gone = await lookup();
    expect(gone.available.map((p) => p.id)).toEqual([catalog[3]!.id, catalog[9]!.id]);
    expect(gone.unavailable).toHaveLength(1);
    expect(gone.unavailable[0]!.snapshot?.title).toBe(row.title);
    expect(unavailablePrice(gone.unavailable[0]!, formatPrice)).toBe(`${formatPrice(savedPrice, 'USD')} when you kept it`);

    row.is_active = true;
    row.price_cents = savedPrice + 2500;
    const back = await lookup(snapshots);
    expect(back.unavailable).toEqual([]);
    const live = back.available.find((p) => p.id === row.id)!;
    expect(live.priceCents).toBe(savedPrice + 2500); // today's price, from the live record
    expect(live.productUrl).toBe(row.product_url); // the verified link again
  });

  it('deleted from the database: shown from its snapshot, or as a plain placeholder without one', async () => {
    const { catalog, lookup, snapshots, kept } = setup();
    const withSnap = kept[1]!.productId;
    const withoutSnap = kept[2]!.productId;
    catalog.splice(catalog.findIndex((r) => r.id === withSnap), 1);
    catalog.splice(catalog.findIndex((r) => r.id === withoutSnap), 1);
    const { [withoutSnap]: _drop, ...partial } = snapshots;
    void _drop;
    const r = await lookup(partial);
    expect(r.unavailable.map((u) => [u.productId, u.snapshot ? 'snapshot' : 'none'])).toEqual([
      [withSnap, 'snapshot'],
      [withoutSnap, 'none'],
    ]);
    expect(unavailablePrice(r.unavailable[1]!, formatPrice)).toBeNull();
  });

  it('a failed lookup is an error, never proof that a product is unavailable', async () => {
    const catalog = fakeCatalog(20);
    const repo = new SupabaseProductRepository(fakeDb(catalog, { failOnRequest: 1 }).db);
    // useAvailability only splits after this resolves; a rejection shows the existing error + Try again.
    await expect(repo.getProducts([catalog[3]!.id])).rejects.toThrow('network down');
  });

  it('a long kept list that fails partway also errors (no partial "unavailable" list)', async () => {
    const catalog = fakeCatalog(400);
    const repo = new SupabaseProductRepository(fakeDb(catalog, { failOnRequest: 2 }).db);
    await expect(repo.getProducts(catalog.map((r) => r.id))).rejects.toThrow('network down');
  });

  it('list share text and totals only include pieces that can be bought', async () => {
    const { catalog, lookup } = setup();
    catalog[7]!.is_active = false;
    const { available } = await lookup();
    const text = shareListText('Bedroom', available, { storeName: () => 'Store', linkFor: (p) => p.productUrl, formatPrice });
    expect(text).not.toContain(catalog[7]!.title);
    expect(text).not.toContain(catalog[7]!.product_url);
    expect(text).toContain(catalog[3]!.title);
  });
});

describe('Local repository (sample catalog)', () => {
  const catalog = generateCatalog();
  it('a saved id missing from the catalog is unavailable; known ones stay live', async () => {
    const repo = new LocalProductRepository(catalog.slice(1), CATEGORIES, SUBCATEGORIES, RETAILERS);
    const kept = [
      { productId: catalog[0]!.id, savedAt: 2 },
      { productId: catalog[1]!.id, savedAt: 1 },
    ];
    const snaps = { [catalog[0]!.id]: savedNow(undefined, catalog[0]!, 2, 2) };
    const r = splitAvailability(kept, await repo.getProducts(kept.map((k) => k.productId)), snaps);
    expect(r.available.map((p) => p.id)).toEqual([catalog[1]!.id]);
    expect(r.unavailable.map((u) => u.productId)).toEqual([catalog[0]!.id]);
    expect(r.unavailable[0]!.snapshot?.title).toBe(catalog[0]!.title);
  });
});
