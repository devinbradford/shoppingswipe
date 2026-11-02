import { useCallback, useEffect, useMemo, useState } from 'react';

import { getProductRepository } from '@/data';
import { countActiveFilters, EMPTY_FILTERS, matchesFilters, type SearchFilters } from '@/domain/filters';
import type { CategorySummary, Product, SubcategorySummary } from '@/domain/types';
import { selectSwipedIds, useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { useAsync } from './useAsync';

/**
 * Rooms and their product types for Discover, with "N left" counts that update
 * as the user swipes.
 */
export function useCategorySummaries() {
  const hydrated = useHydrated();
  const swipes = useSwipeStore((s) => s.swipes);
  const base = useAsync(async () => {
    const repo = getProductRepository();
    const [categories, subcategories, totals] = await Promise.all([
      repo.listCategories(),
      repo.listSubcategories(),
      repo.countBySubcategory(),
    ]);
    const firsts = await Promise.all(subcategories.map((s) => repo.listProducts({ subcategoryId: s.id, limit: 1 })));
    const covers = new Map(subcategories.map((s, i) => [s.id, firsts[i][0]?.imageUrls[0]]));
    return { categories, subcategories, totals, covers };
  }, []);

  // Recount what's left whenever the swipe log changes.
  const swipeKey = swipes.length;
  const remaining = useAsync(
    () => getProductRepository().countBySubcategory(selectSwipedIds(useSwipeStore.getState())),
    [swipeKey],
  );

  const baseData = base.data;
  const left = remaining.data;
  const summaries = useMemo<CategorySummary[]>(() => {
    if (!baseData) return [];
    return baseData.categories.map((c) => {
      const subcategories: SubcategorySummary[] = baseData.subcategories
        .filter((s) => s.categoryId === c.id)
        .map((s) => {
          const totalCount = baseData.totals[s.id] ?? 0;
          return { ...s, totalCount, remainingCount: left?.[s.id] ?? totalCount, coverUrl: baseData.covers.get(s.id) };
        });
      return {
        ...c,
        subcategories,
        totalCount: subcategories.reduce((n, s) => n + s.totalCount, 0),
        remainingCount: subcategories.reduce((n, s) => n + s.remainingCount, 0),
      };
    });
  }, [baseData, left]);

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

/** Search the whole catalog by text and/or filters. Debounced so typing stays smooth. */
export function useProductSearch(query: string, filters: SearchFilters = EMPTY_FILTERS, delayMs = 160) {
  const [debounced, setDebounced] = useState(query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), delayMs);
    return () => clearTimeout(t);
  }, [query, delayMs]);

  const active = debounced.length > 0 || countActiveFilters(filters) > 0;
  const result = useAsync<Product[]>(
    () =>
      active ? getProductRepository().listProducts({ search: debounced, filters, limit: 200 }) : Promise.resolve([]),
    [debounced, filters],
  );
  return { ...result, query: debounced, pending: debounced !== query.trim() };
}

/** Categories and retailers to offer as filters, plus a live result counter. */
export function useFilterOptions(query: string) {
  const options = useAsync(async () => {
    const repo = getProductRepository();
    const [categories, retailers, all] = await Promise.all([
      repo.listCategories(),
      repo.listRetailers(),
      repo.listProducts({ search: query.trim() }),
    ]);
    return { categories, retailers, all };
  }, [query.trim()]);
  const all = options.data?.all;
  const countFor = useCallback(
    (draft: SearchFilters) => (all ? all.filter((p) => matchesFilters(p, draft)).length : null),
    [all],
  );
  return {
    categories: options.data?.categories ?? [],
    retailers: options.data?.retailers ?? [],
    countFor,
  };
}

/** Retailer id -> display name. */
export function useRetailerNames() {
  const result = useAsync(async () => {
    const retailers = await getProductRepository().listRetailers();
    return new Map(retailers.map((r) => [r.id, r.name]));
  }, []);
  return result.status === 'ready' ? result.data : new Map<string, string>();
}

/** Style tags with cover photos, for the taste picker. */
export function useStyleOptions() {
  return useAsync(() => getProductRepository().listStyles(), []);
}
