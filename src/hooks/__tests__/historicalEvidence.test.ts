/**
 * Learning-data integrity, fix 1: swipes and signals on products the catalog stops returning keep
 * counting. End to end: SupabaseProductRepository over the fake PostgREST (which hides inactive
 * rows like the read rule `using (is_active)`), the real stores, and `currentTasteModel`, which
 * every taste consumer (For you, Your taste, Weekly 10, product page) goes through.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SupabaseProductRepository } from '@/data/SupabaseProductRepository';
import { fakeDb, type FakeRow } from '@/data/__fixtures__/fakePostgrest';
import type { Product, SwipeEvent } from '@/domain/types';
import { productFromRow } from '@/lib/rows';
import { ORPHAN_GRACE_MS } from '@/domain/availability';
import { computePriceBands, isColdStartModel, rankDeck, tasteSummary } from '@/recommendation';
import { clearLocalLearningData, claimLocalLearningData } from '@/store/localLearningData';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useProductFactsStore } from '@/store/productFactsStore';
import { useSnapshotStore } from '@/store/productSnapshotStore';
import { useSignalStore } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';
import { clearLocalAccountData } from '@/sync/appSync';
import { currentTasteModel, engagedProductIds, factsEpoch, rememberFacts } from '../tasteModel';

const row = (id: string, look: 'walnut' | 'white', i: number): FakeRow => ({
  id,
  category_id: 'bedroom',
  subcategory_id: 'nightstands',
  retailer_id: look === 'walnut' ? 'r1' : 'r2',
  title: `${look} piece ${i}`,
  brand: look === 'walnut' ? 'Oakline' : 'Seaside',
  description: '',
  price_cents: 15000 + i * 1000,
  currency: 'USD',
  image_urls: [],
  product_url: `https://shop.example.com/${id}`,
  style_tags: [look === 'walnut' ? 'mid-century' : 'coastal'],
  material: look === 'walnut' ? 'walnut' : 'rattan',
  color: look === 'walnut' ? 'walnut' : 'white',
  created_at: '2026-11-01T00:00:00Z',
  is_active: true,
});
const keptRows = Array.from({ length: 6 }, (_, i) => row(`w${i}`, 'walnut', i));
const skippedRows = Array.from({ length: 6 }, (_, i) => row(`c${i}`, 'white', i));
const freshRows = [
  ...Array.from({ length: 4 }, (_, i) => row(`nw${i}`, 'walnut', i + 10)),
  ...Array.from({ length: 4 }, (_, i) => row(`nc${i}`, 'white', i + 10)),
];
const swipes: SwipeEvent[] = [
  ...keptRows.map((r, i) => ({ id: `k${i}`, productId: r.id, categoryId: 'bedroom' as const, direction: 'keep' as const, swipedAt: 1000 + i * 2 })),
  ...skippedRows.map((r, i) => ({ id: `s${i}`, productId: r.id, categoryId: 'bedroom' as const, direction: 'skip' as const, swipedAt: 1001 + i * 2 })),
];
const allRows = () => [...keptRows, ...skippedRows, ...freshRows].map((r) => ({ ...r }));
const bands = computePriceBands(allRows().map(productFromRow));

/** What useDeck / useTaste / useRetention / useProductInsights do: read the epoch, fetch, remember, build. */
async function modelNow(rows: FakeRow[]) {
  const repo = new SupabaseProductRepository(fakeDb(rows).db);
  const epoch = factsEpoch();
  const engaged = await repo.getProducts(engagedProductIds());
  rememberFacts(engaged, epoch);
  return currentTasteModel(new Map<string, Product>(engaged.map((p) => [p.id, p])), bands);
}

/** Average position (0 = top) of the white pieces among 8 fresh ones, over 50 seeds. */
function whitePosition(model: ReturnType<typeof currentTasteModel>) {
  const fresh = freshRows.map(productFromRow);
  let total = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const order = rankDeck(fresh, model, { bands, seed }).map((r) => r.product.id);
    total += order.filter((id) => id.startsWith('nc')).reduce((s, id) => s + order.indexOf(id), 0) / 4;
  }
  return total / 50;
}

beforeEach(() => {
  useSwipeStore.setState({ swipes, saved: [] });
  useSignalStore.setState({ signals: [], feedback: [] });
  usePreferencesStore.getState().resetAll();
  useProductFactsStore.getState().resetAll();
  useSnapshotStore.getState().resetAll();
});

describe('inactive products keep their historical contribution', () => {
  it('kept products switched off: the model is exactly what it was (was: 0 keeps, back to cold start)', async () => {
    const rows = allRows();
    const before = await modelNow(rows);
    for (const r of rows) if (r.id.startsWith('w')) r.is_active = false;
    const after = await modelNow(rows);
    expect(after).toEqual(before);
    expect(after.keepCount).toBe(6);
    expect(after.swipeCount).toBe(12);
    expect(isColdStartModel(after)).toBe(false);
    expect(tasteSummary(after).stage).toBe(tasteSummary(before).stage);
  });

  it("a whole retailer's products switched off at once (stale feed) erases nothing", async () => {
    const rows = allRows();
    const before = await modelNow(rows);
    for (const r of rows) if (r.retailer_id === 'r2') r.is_active = false;
    const after = await modelNow(rows);
    expect(after).toEqual(before);
    expect(after.weights['color:white']).toEqual(before.weights['color:white']);
  });

  it('ranking stays as it was (was: white pieces drifted to chance level, 3.48 of 7)', async () => {
    const rows = allRows();
    const before = whitePosition(await modelNow(rows));
    for (const r of rows) if (r.id.length === 2) r.is_active = false; // every swiped product
    const after = whitePosition(await modelNow(rows));
    expect(after).toBe(before);
    expect(before).toBeGreaterThan(5);
  });

  it('historical engagement signals stay meaningful (a purchase on a switched-off product)', async () => {
    useSignalStore.setState({ signals: [{ id: 'p1', productId: 'w0', type: 'purchase', at: 2000 }], feedback: [] });
    const rows = allRows();
    const before = await modelNow(rows);
    rows.find((r) => r.id === 'w0')!.is_active = false;
    const after = await modelNow(rows);
    expect(after.positiveCount).toBe(before.positiveCount);
    expect(after).toEqual(before);
  });

  it('a product deleted outright still counts on this phone (facts saved earlier)', async () => {
    const rows = allRows();
    const before = await modelNow(rows);
    const after = await modelNow(rows.filter((r) => r.id !== 'w3'));
    expect(after).toEqual(before);
  });

  it('live attributes take priority: a price or label change in the catalog is used, not the old facts', async () => {
    const rows = allRows();
    await modelNow(rows); // facts saved with the old values
    for (const r of rows) if (r.id.startsWith('w')) r.material = 'oak';
    const updated = await modelNow(rows);
    expect(updated.weights['material:oak']).toBeDefined();
    expect(updated.weights['material:walnut']).toBeUndefined();
    // …and the saved facts follow the catalog, so a later switch-off keeps the NEW values.
    for (const r of rows) if (r.id.startsWith('w')) r.is_active = false;
    expect((await modelNow(rows)).weights['material:oak']).toEqual(updated.weights['material:oak']);
  });

  it('without saved facts (history from before this fix, never seen live since) the old loss remains', async () => {
    const rows = allRows();
    for (const r of rows) if (r.id.startsWith('w')) r.is_active = false;
    const m = await modelNow(rows); // first look happens after they went inactive
    expect(m.keepCount).toBe(0);
  });
});

describe('what gets saved, and when it is cleared', () => {
  it('only products the shopper reacted to are saved', async () => {
    const repo = new SupabaseProductRepository(fakeDb(allRows()).db);
    rememberFacts(await repo.getProducts(['w0', 'nw0']), factsEpoch());
    expect(Object.keys(useProductFactsStore.getState().facts)).toEqual(['w0']);
  });

  it('survives an app restart', async () => {
    await modelNow(allRows());
    await new Promise((r) => setTimeout(r, 0));
    const stored = await AsyncStorage.getItem('cureavo.productFacts.v1');
    expect(stored).toContain('"w0"');
    expect(stored).not.toContain('shop.example.com');
    useProductFactsStore.setState({ facts: {} });
    await AsyncStorage.setItem('cureavo.productFacts.v1', stored!);
    await useProductFactsStore.persist.rehydrate();
    expect(Object.keys(useProductFactsStore.getState().facts)).toHaveLength(12);
  });

  it('a lookup that started before a reset or sign-out cannot write facts back', async () => {
    const repo = new SupabaseProductRepository(fakeDb(allRows()).db);
    const epoch = factsEpoch();
    const engaged = await repo.getProducts(engagedProductIds());
    clearLocalLearningData();
    rememberFacts(engaged, epoch);
    expect(useProductFactsStore.getState().facts).toEqual({});
  });

  it('sign-out (and account deletion) clears the facts', async () => {
    await modelNow(allRows());
    clearLocalAccountData();
    expect(useProductFactsStore.getState().facts).toEqual({});
  });

  it("switching accounts never carries one account's facts to another", async () => {
    claimLocalLearningData('user-a');
    await modelNow(allRows());
    claimLocalLearningData('user-a');
    expect(Object.keys(useProductFactsStore.getState().facts)).toHaveLength(12);
    claimLocalLearningData('user-b');
    expect(useProductFactsStore.getState().facts).toEqual({});
  });

  it('clean-up keeps facts the swipe log still points at; deletes others only after the grace period', async () => {
    await modelNow(allRows());
    useSwipeStore.setState({ swipes: swipes.filter((s) => s.productId !== 'w0') });
    const refs = new Set(engagedProductIds());
    useProductFactsStore.getState().sweep(refs, 1000);
    expect(useProductFactsStore.getState().facts.w0?.orphanedAt).toBe(1000);
    useProductFactsStore.getState().sweep(refs, 1000 + ORPHAN_GRACE_MS - 1);
    expect(useProductFactsStore.getState().facts.w0).toBeDefined(); // still inside the grace period
    useProductFactsStore.getState().sweep(refs, 1000 + ORPHAN_GRACE_MS);
    expect(useProductFactsStore.getState().facts.w0).toBeUndefined();
    expect(Object.keys(useProductFactsStore.getState().facts)).toHaveLength(11);
  });
});
