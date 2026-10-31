import { useEffect, useMemo, useState } from 'react';

import { getProductRepository } from '@/data';
import type { CategoryId, CategorySummary, Product } from '@/domain/types';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { useAsync } from './useAsync';

/** Category tiles with "N left" counts that update as the user swipes. */
export function useCategorySummaries() {
  const hydrated = useHydrated();
  const swipes = useSwipeStore((s) => s.swipes);
  const base = useAsync(async () => {
    const repo = getProductRepository();
    const [categories, counts] = await Promise.all([repo.listCategories(), repo.countByCategory()]);
    const firsts = await Promise.all(categories.map((c) => repo.listProducts({ categoryId: c.id, limit: 1 })));
    const covers = new Map(categories.map((c, i) => [c.id, firsts[i][0]?.imageUrls[0]]));
    return { categories, counts, covers };
  }, []);

  const baseData = base.data;
  const summaries = useMemo<(CategorySummary & { coverUrl?: string })[]>(() => {
    if (!baseData) return [];
    const swipedPerCategory = new Map<CategoryId, Set<string>>();
    for (const s of swipes) {
      const set = swipedPerCategory.get(s.categoryId) ?? new Set<string>();
      set.add(s.productId);
      swipedPerCategory.set(s.categoryId, set);
    }
    return baseData.categories.map((c) => {
      const totalCount = baseData.counts[c.id] ?? 0;
      const swiped = swipedPerCategory.get(c.id)?.size ?? 0;
      return {
        ...c,
        totalCount,
        remainingCount: Math.max(0, totalCount - swiped),
        coverUrl: baseData.covers.get(c.id),
      };
    });
  }, [baseData, swipes]);

  return {
    status: hydrated ? base.status : ('loading' as const),
    error: base.error,
    summaries,
    reload: base.reload,
  };
}

/** Kept products, newest first. */
export function useSavedProducts() {
  const hydrated = useHydrated();
  const saved = useSwipeStore((s) => s.saved);
  const ids = useMemo(() => saved.map((s) => s.productId), [saved]);
  const key = ids.join(',');
  const result = useAsync(() => getProductRepository().getProducts(ids), [key]);
  return { ...result, status: hydrated ? result.status : ('loading' as const), count: ids.length };
}

export function useProduct(id: string | undefined) {
  return useAsync(async () => {
    if (!id) return null;
    const repo = getProductRepository();
    const product = await repo.getProduct(id);
    if (!product) return null;
    const retailer = (await repo.listRetailers()).find((r) => r.id === product.retailerId) ?? null;
    return { product, retailer };
  }, [id]);
}

/** Search the whole catalog. Debounced so typing stays smooth. */
export function useProductSearch(query: string, delayMs = 160) {
  const [debounced, setDebounced] = useState(query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), delayMs);
    return () => clearTimeout(t);
  }, [query, delayMs]);

  const result = useAsync<Product[]>(
    () => (debounced ? getProductRepository().listProducts({ search: debounced, limit: 60 }) : Promise.resolve([])),
    [debounced],
  );
  return { ...result, query: debounced, pending: debounced !== query.trim() };
}

/** Retailer id -> display name. */
export function useRetailerNames() {
  const result = useAsync(async () => {
    const retailers = await getProductRepository().listRetailers();
    return new Map(retailers.map((r) => [r.id, r.name]));
  }, []);
  return result.status === 'ready' ? result.data : new Map<string, string>();
}
