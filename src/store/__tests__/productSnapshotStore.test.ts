import AsyncStorage from '@react-native-async-storage/async-storage';

import { unavailablePrice, ORPHAN_GRACE_MS } from '@/domain/availability';
import type { Product } from '@/domain/types';
import { referencedProductIds } from '@/hooks/useProductSnapshots';
import { formatPrice } from '@/lib/format';
import { clearLocalAccountData } from '@/sync/appSync';
import { rememberSavedProduct, useSnapshotStore } from '../productSnapshotStore';
import { usePurchaseStore } from '../purchaseStore';
import { useSwipeStore } from '../swipeStore';
import { useWishlistStore } from '../wishlistStore';

const product = (id: string, priceCents = 10000): Product => ({
  id,
  categoryId: 'bedroom',
  subcategoryId: 'nightstands',
  retailerId: 'r1',
  title: `Piece ${id}`,
  brand: 'Example Brand',
  description: '',
  priceCents,
  currency: 'USD',
  imageUrls: [`https://img.example.com/${id}.jpg`],
  productUrl: `https://shop.example.com/${id}`,
  styleTags: [],
  material: '',
  color: '',
  createdAt: '2026-11-01T00:00:00Z',
});

/** What useDeck does on a Keep. */
function keep(p: Product, at: number) {
  useSwipeStore.getState().recordSwipe({ id: `${p.id}@${at}`, productId: p.id, categoryId: p.categoryId, direction: 'keep', swipedAt: at });
  const item = useSwipeStore.getState().saved.find((i) => i.productId === p.id);
  if (item?.savedAt === at) rememberSavedProduct(p, at);
}

const snap = (id: string) => useSnapshotStore.getState().snapshots[id];
const priceLine = (id: string) => {
  const item = useSwipeStore.getState().saved.find((i) => i.productId === id);
  return unavailablePrice({ productId: id, savedAt: item?.savedAt, snapshot: snap(id) ?? null }, formatPrice);
};

beforeEach(() => {
  useSwipeStore.getState().resetAll();
  useWishlistStore.getState().resetAll();
  usePurchaseStore.getState().resetAll();
  useSnapshotStore.getState().resetAll();
});

describe('Undo and removal never lose a snapshot early', () => {
  it('Undo after Keep: the kept item goes, the snapshot stays (only marked by a clean-up pass)', () => {
    keep(product('a', 75999), 100);
    expect(snap('a')?.priceAtSave).toEqual({ cents: 75999, currency: 'USD', savedAt: 100 });
    useSwipeStore.getState().undoLastSwipe();
    expect(useSwipeStore.getState().saved).toEqual([]);
    useSnapshotStore.getState().sweep(referencedProductIds(), 1000);
    expect(snap('a')?.orphanedAt).toBe(1000);
    // Kept again within the grace period: same snapshot, mark cleared, new save gets its own price.
    keep(product('a', 70000), 2000);
    useSnapshotStore.getState().sweep(referencedProductIds(), 3000);
    expect(snap('a')?.orphanedAt).toBeUndefined();
    expect(snap('a')?.priceAtSave).toEqual({ cents: 70000, currency: 'USD', savedAt: 2000 });
  });

  it('removing an unavailable piece and pressing Undo brings back the same save and its price', () => {
    keep(product('a', 75999), 100);
    const item = useSwipeStore.getState().saved[0]!;
    useSwipeStore.getState().removeSaved('a');
    useSnapshotStore.getState().sweep(referencedProductIds(), 500); // e.g. a restart mid-toast is impossible, but a pass can't hurt
    useSwipeStore.getState().restoreSaved(item);
    expect(priceLine('a')).toBe('$759.99 when you kept it');
  });

  it('is only deleted after being unreferenced for the whole grace period', () => {
    keep(product('a'), 100);
    useSwipeStore.getState().removeSaved('a');
    useSnapshotStore.getState().sweep(referencedProductIds(), 1000);
    useSnapshotStore.getState().sweep(referencedProductIds(), 1000 + ORPHAN_GRACE_MS - 1);
    expect(snap('a')).toBeDefined();
    useSnapshotStore.getState().sweep(referencedProductIds(), 1000 + ORPHAN_GRACE_MS);
    expect(snap('a')).toBeUndefined();
  });

  it('lists and purchases keep a snapshot alive even when it is not in Kept', () => {
    keep(product('a'), 1);
    keep(product('b'), 2);
    const list = useWishlistStore.getState().create('Bedroom');
    if (!list.ok) throw new Error(list.error);
    useWishlistStore.getState().add(list.id, ['a']);
    usePurchaseStore.getState().answer('b', true);
    useSwipeStore.getState().removeSaved('a');
    useSwipeStore.getState().removeSaved('b');
    useSnapshotStore.getState().sweep(referencedProductIds(), 1);
    useSnapshotStore.getState().sweep(referencedProductIds(), 1 + ORPHAN_GRACE_MS * 2);
    expect(snap('a')?.orphanedAt).toBeUndefined();
    expect(snap('b')?.orphanedAt).toBeUndefined();
  });
});

describe('restart', () => {
  it('snapshots and their save prices survive an app restart', async () => {
    keep(product('a', 32999), 100);
    await new Promise((r) => setTimeout(r, 0)); // let persist write
    const stored = await AsyncStorage.getItem('cureavo.snapshots.v1');
    expect(stored).toContain('32999');
    expect(stored).not.toContain('shop.example.com');
    // A restart: memory starts empty, storage still holds what was written.
    useSnapshotStore.setState({ snapshots: {}, owner: null });
    await AsyncStorage.setItem('cureavo.snapshots.v1', stored!);
    await useSnapshotStore.persist.rehydrate();
    expect(snap('a')?.priceAtSave).toEqual({ cents: 32999, currency: 'USD', savedAt: 100 });
  });
});

describe('late answers and account boundaries', () => {
  it('a catalog answer that started before a reset or sign-out is ignored', () => {
    keep(product('a'), 1);
    const epoch = useSnapshotStore.getState().epoch;
    useSnapshotStore.getState().resetAll();
    useSnapshotStore.getState().refreshFromCatalog([product('a', 1)], epoch, new Set(['a']));
    expect(snap('a')).toBeUndefined();
  });

  it('a late answer only refreshes products something still points at', () => {
    const { epoch } = useSnapshotStore.getState();
    useSnapshotStore.getState().refreshFromCatalog([product('stray')], epoch, new Set(['a']));
    expect(snap('stray')).toBeUndefined();
  });

  it('signing out clears snapshots along with kept items and lists', () => {
    keep(product('a'), 1);
    clearLocalAccountData();
    expect(useSwipeStore.getState().saved).toEqual([]);
    expect(useSnapshotStore.getState().snapshots).toEqual({});
  });

  it("anonymous snapshots go with the history merged into an account; another account's never carry over", () => {
    keep(product('a'), 1);
    useSnapshotStore.getState().claimFor('user-1');
    expect(snap('a')).toBeDefined();
    expect(useSnapshotStore.getState().owner).toBe('user-1');
    useSnapshotStore.getState().claimFor('user-1');
    expect(snap('a')).toBeDefined();
    // A different account on this phone (without the usual sign-out): nothing of user-1's shows.
    const before = useSnapshotStore.getState().epoch;
    useSnapshotStore.getState().claimFor('user-2');
    expect(useSnapshotStore.getState().snapshots).toEqual({});
    expect(useSnapshotStore.getState().epoch).toBe(before + 1);
  });

  it('a sync replacing the kept list leaves snapshots alone (marked, not deleted, if no longer referenced)', () => {
    keep(product('a'), 1);
    keep(product('b'), 2);
    // What appSync's replaceState does with the account's facts.
    useSwipeStore.setState({ saved: [{ productId: 'b', savedAt: 2 }, { productId: 'c', savedAt: 3 }] });
    useSnapshotStore.getState().sweep(referencedProductIds(), 10);
    expect(snap('a')?.orphanedAt).toBe(10);
    expect(snap('b')?.orphanedAt).toBeUndefined();
    expect(snap('c')).toBeUndefined(); // kept on another phone: no copy, shown as "A piece you kept"
  });
});
