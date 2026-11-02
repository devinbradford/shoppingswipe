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
