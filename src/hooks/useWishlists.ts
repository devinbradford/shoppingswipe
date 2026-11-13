import { useCallback, useMemo } from 'react';

import { getProductRepository } from '@/data';
import { useSnapshotStore } from '@/store/productSnapshotStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { useAsync } from './useAsync';
import { useAvailability } from './useProductSnapshots';

export function useWishlist(id: string | undefined) {
  return useWishlistStore((s) => s.lists.find((l) => l.id === id));
}

const NO_ITEMS: readonly { productId: string }[] = [];

/**
 * Products in a list, newest first: those the catalog still returns, and those it no longer
 * does (`unavailable`, shown from their snapshots).
 */
export function useWishlistProducts(id: string | undefined, retailerNames?: ReadonlyMap<string, string>) {
  const list = useWishlist(id);
  // List items carry no save price, so unavailable ones show "Last seen at", never "when you kept it".
  const items = useMemo(() => list?.items.map((i) => ({ productId: i.productId })) ?? NO_ITEMS, [list]);
  const result = useAvailability(items, retailerNames);
  return {
    list,
    products: result.available,
    unavailable: result.unavailable,
    status: result.status,
    reload: result.reload,
  };
}

export type TransferMode = 'copy' | 'move';

/**
 * Put kept items into a list. "Copy" leaves them in Kept too; "move" takes
 * them out of Kept. The swipe log is never touched, so taste is unaffected.
 */
export function useTransferFromKept() {
  const add = useWishlistStore((s) => s.add);
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  return useCallback(
    (productIds: readonly string[], listId: string, mode: TransferMode) => {
      add(listId, productIds);
      if (mode === 'move') productIds.forEach(removeSaved);
    },
    [add, removeSaved],
  );
}

/** Lists the product is in. */
export function useListsForProduct(productId: string) {
  const lists = useWishlistStore((s) => s.lists);
  return useMemo(() => lists.filter((l) => l.items.some((i) => i.productId === productId)), [lists, productId]);
}

/** The first four photo URLs of each list, for its cover collage. */
export function useListCovers(lists: readonly { id: string; items: readonly { productId: string }[] }[]) {
  const key = lists.map((l) => `${l.id}:${l.items.slice(0, 4).map((i) => i.productId)}`).join('|');
  const ids = [...new Set(lists.flatMap((l) => l.items.slice(0, 4).map((i) => i.productId)))];
  const result = useAsync(() => getProductRepository().getProducts(ids), [key]);
  const snapshots = useSnapshotStore((s) => s.snapshots);
  return useMemo(() => {
    const live = new Map((result.data ?? []).map((p) => [p.id, p.imageUrls[0]]));
    // A piece the catalog no longer returns keeps its last-seen photo on the cover.
    const photo = (id: string) => (live.has(id) ? live.get(id) : snapshots[id]?.imageUrl);
    return new Map(lists.map((l) => [l.id, l.items.slice(0, 4).map((i) => photo(i.productId))]));
  }, [result.data, lists, snapshots]);
}
