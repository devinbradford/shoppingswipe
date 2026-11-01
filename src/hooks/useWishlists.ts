import { useCallback, useMemo } from 'react';

import { getProductRepository } from '@/data';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { useWishlistStore } from '@/store/wishlistStore';
import { useAsync } from './useAsync';

export function useWishlist(id: string | undefined) {
  return useWishlistStore((s) => s.lists.find((l) => l.id === id));
}

/** Products in a list, newest first. */
export function useWishlistProducts(id: string | undefined) {
  const hydrated = useHydrated();
  const list = useWishlist(id);
  const key = list?.items.map((i) => i.productId).join(',') ?? '';
  const result = useAsync(() => getProductRepository().getProducts(key ? key.split(',') : []), [key]);
  return {
    list,
    products: result.data ?? [],
    status: hydrated ? result.status : ('loading' as const),
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

/** Cover photo for each list (its newest item's first photo). */
export function useListCovers() {
  const lists = useWishlistStore((s) => s.lists);
  const firsts = lists.map((l) => l.items[0]?.productId ?? '');
  const key = firsts.join(',');
  const result = useAsync(async () => {
    const products = await getProductRepository().getProducts(key.split(',').filter(Boolean));
    return new Map(products.map((p) => [p.id, p.imageUrls[0]]));
  }, [key]);
  return useMemo(() => {
    const byProduct = result.data ?? new Map<string, string>();
    return new Map(lists.map((l) => [l.id, byProduct.get(l.items[0]?.productId ?? '')]));
  }, [lists, result.data]);
}
