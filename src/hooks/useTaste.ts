import { useCallback, useEffect, useState } from 'react';

import { getProductRepository } from '@/data';
import { stylePhoto } from '@/data/stylePhotos';
import { budgetAnchor } from '@/domain/budget';
import type { Product } from '@/domain/types';
import { priceBandFor, tasteSummary, type TasteSummary } from '@/recommendation';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSignalStore } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { currentTasteModel, engagedProductIds } from './tasteModel';

/** A bundled room photo, or a product photo URL. */
export type StylePhotoSource = { bundled: number } | { uri: string };

export interface TasteView {
  status: 'loading' | 'ready' | 'error';
  summary: TasteSummary | null;
  /** "a sofa" and their usual price and soft ceiling for it, once there's a budget. */
  price: { noun: string; usualCents: number; ceilingCents: number } | null;
  /** A photo for each liked style: the room photo if there is one, else a piece they liked in that style. */
  stylePhotos: Map<string, StylePhotoSource | undefined>;
  reload: () => void;
}

/** Everything the "Your taste" screen shows, rebuilt whenever their swipes, signals or answers change. */
export function useTaste(): TasteView {
  const hydrated = useHydrated();
  const swipes = useSwipeStore((s) => s.swipes);
  const signals = useSignalStore((s) => s.signals);
  const feedback = useSignalStore((s) => s.feedback);
  const room = usePreferencesStore((s) => s.room);
  const budget = usePreferencesStore((s) => s.budget);
  const picks = usePreferencesStore((s) => s.stylePicks);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<Omit<TasteView, 'reload'>>({
    status: 'loading',
    summary: null,
    price: null,
    stylePhotos: new Map(),
  });

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const repo = getProductRepository();
    (async () => {
      const [engaged, bands] = await Promise.all([repo.getProducts(engagedProductIds()), repo.getPriceBands()]);
      if (cancelled) return;
      const known = new Map<string, Product>(engaged.map((p) => [p.id, p]));
      const model = currentTasteModel(known, bands);
      const summary = tasteSummary(model);
      const anchor = budgetAnchor(room);
      const band = priceBandFor(model, bands, anchor.subcategoryId);
      // Pieces they liked, newest first, for style photos without a room photo.
      const liked = [...swipes]
        .reverse()
        .filter((s) => s.direction === 'keep')
        .map((s) => known.get(s.productId))
        .filter((p): p is Product => !!p);
      const stylePhotos = new Map<string, StylePhotoSource | undefined>(
        summary.styles.map((t) => {
          const bundled = stylePhoto(t.label);
          const uri = liked.find((p) => p.styleTags.includes(t.label))?.imageUrls[0];
          return [t.key, bundled !== undefined ? { bundled } : uri ? { uri } : undefined];
        }),
      );
      setView({
        status: 'ready',
        summary,
        price: band ? { noun: anchor.noun, ...band } : null,
        stylePhotos,
      });
    })().catch(() => {
      if (!cancelled) setView((v) => ({ ...v, status: 'error' }));
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, swipes, signals, feedback, room, budget, picks, attempt]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...view, reload };
}
