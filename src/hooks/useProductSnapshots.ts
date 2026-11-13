import { useEffect, useMemo } from 'react';

import { getProductRepository } from '@/data';
import { splitAvailability, type UnavailableItem } from '@/domain/availability';
import type { Product } from '@/domain/types';
import { useSnapshotStore } from '@/store/productSnapshotStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { useWishlistStore } from '@/store/wishlistStore';
import { useAsync } from './useAsync';

/** Every product something on this phone still points at: Kept, any list, a purchase. */
export function referencedProductIds(): Set<string> {
  return new Set([
    ...useSwipeStore.getState().saved.map((i) => i.productId),
    ...useWishlistStore.getState().lists.flatMap((l) => l.items.map((i) => i.productId)),
    ...usePurchaseStore.getState().bought.map((b) => b.productId),
  ]);
}

/**
 * One snapshot clean-up pass per app start, only after everything saved on the phone has
 * loaded. Undo can't outlive a restart, and orphans wait out a grace period before deletion.
 */
export function useSnapshotSweep(): void {
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated) useSnapshotStore.getState().sweep(referencedProductIds());
  }, [hydrated]);
}

export interface Availability {
  status: 'loading' | 'ready' | 'error';
  /** Products the catalog returned: shown live, with today's price and link. */
  available: Product[];
  /** Saved ids the catalog didn't return in a lookup that succeeded. */
  unavailable: UnavailableItem[];
  reload: () => void;
}

/**
 * Looks up saved items in the catalog and splits them into available and unavailable.
 * - Only a lookup that succeeded decides "unavailable"; a failed one is `status: 'error'`.
 * - Items added since the lookup started are left out until the next lookup returns, so a
 *   just-kept piece never flashes up as unavailable.
 * - Successful lookups refresh the snapshots, unless the phone was reset or signed out meanwhile.
 */
export function useAvailability(
  items: readonly { productId: string; savedAt?: number }[],
  retailerNames?: ReadonlyMap<string, string>,
): Availability {
  const hydrated = useHydrated();
  const ids = useMemo(() => [...new Set(items.map((i) => i.productId))], [items]);
  const key = ids.join(',');
  const result = useAsync(async () => {
    const epoch = useSnapshotStore.getState().epoch;
    const requested = key ? key.split(',') : [];
    const products = await getProductRepository().getProducts(requested);
    return { requested: new Set(requested), products, epoch };
  }, [key]);
  const snapshots = useSnapshotStore((s) => s.snapshots);

  const data = result.status === 'ready' ? result.data : undefined;
  useEffect(() => {
    if (!data) return;
    useSnapshotStore.getState().refreshFromCatalog(data.products, data.epoch, referencedProductIds(), retailerNames);
  }, [data, retailerNames]);

  const split = useMemo(() => {
    if (!data) return { available: [], unavailable: [] };
    return splitAvailability(
      items.filter((i) => data.requested.has(i.productId)),
      data.products,
      snapshots,
    );
  }, [data, items, snapshots]);

  return {
    status: !hydrated ? 'loading' : result.status,
    available: split.available,
    unavailable: split.unavailable,
    reload: result.reload,
  };
}
