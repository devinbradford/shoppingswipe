import { useEffect, useState } from 'react';

import { getProductRepository } from '@/data';
import type { Product } from '@/domain/types';
import { formatWhy, similarProducts, whyForYou } from '@/recommendation';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { currentTasteModel, engagedProductIds, factsEpoch, rememberFacts } from './tasteModel';

export interface ProductInsights {
  /** "Mid-century and walnut, within your budget", or null. */
  why: string | null;
  /** Similar pieces in the same room, ranked for this shopper. Empty while loading. */
  similar: Product[];
}

/** "Why it's for you" and "More like this" for the product page. */
export function useProductInsights(product: Product): ProductInsights {
  const hydrated = useHydrated();
  const [insights, setInsights] = useState<ProductInsights>({ why: null, similar: [] });

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const repo = getProductRepository();
    const epoch = factsEpoch();
    (async () => {
      const [room, engaged, bands] = await Promise.all([
        repo.listProducts({ categoryId: product.categoryId }),
        repo.getProducts(engagedProductIds()),
        repo.getPriceBands(),
      ]);
      if (cancelled) return;
      rememberFacts(engaged, epoch);
      const known = new Map<string, Product>();
      for (const p of [...room, ...engaged, product]) known.set(p.id, p);
      const model = currentTasteModel(known, bands);
      // Leave out what they already said no to.
      const skipped = new Set(
        useSwipeStore
          .getState()
          .swipes.filter((s) => s.direction === 'skip')
          .map((s) => s.productId),
      );
      setInsights({
        why: formatWhy(whyForYou(product, model, bands)),
        similar: similarProducts(product, room, model, bands, { excludeIds: skipped }),
      });
    })().catch(() => {
      // Nice to have: the page works without it.
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, product]);

  return insights;
}
