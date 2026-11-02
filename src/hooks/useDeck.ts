import { useCallback, useEffect, useRef, useState } from 'react';

import { getProductRepository } from '@/data';
import type { CategoryId, Product, SubcategoryId, SwipeDirection } from '@/domain/types';
import {
  buildTasteProfile,
  formatReasons,
  reasonLabels,
  hashSeed,
  isColdStart,
  rankProducts,
  rerankQueue,
  type PriceBands,
  type RankedProduct,
} from '@/recommendation';
import { newId } from '@/lib/ids';
import { usePreferencesStore } from '@/store/preferencesStore';
import { selectSwipedIds, useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';

export type DeckStatus = 'loading' | 'ready' | 'error';

export interface DeckCard extends RankedProduct {
  /** "Matches your taste for walnut and mid-century", or null. */
  reasonText: string | null;
  /** Short reasons for the "For you" bubble, e.g. "mid-century, walnut", or null. */
  forYou: string | null;
}

export interface Deck {
  status: DeckStatus;
  error?: Error;
  /** Cards in order; the first is on top. */
  cards: DeckCard[];
  /** True until the user has kept enough items for personal ranking. */
  coldStart: boolean;
  swipe: (direction: SwipeDirection) => void;
  undo: () => void;
  canUndo: boolean;
  retry: () => void;
}

/** Styles picked on first launch. */
const picks = () => usePreferencesStore.getState().stylePicks;

function toCard(r: RankedProduct): DeckCard {
  const labels = reasonLabels(r.reasons);
  return { ...r, reasonText: formatReasons(r.reasons), forYou: labels.length ? labels.join(', ') : null };
}

/**
 * The swipe deck for one category. Loads unswiped products, ranks them with
 * the taste profile (built from every swipe in every category), and re-ranks
 * everything behind the two visible cards after each swipe.
 */
export function useDeck(categoryId: CategoryId, subcategoryId?: SubcategoryId): Deck {
  const deckKey = subcategoryId ?? categoryId;
  const hydrated = useHydrated();
  const recordSwipe = useSwipeStore((s) => s.recordSwipe);
  const undoLastSwipe = useSwipeStore((s) => s.undoLastSwipe);

  const [status, setStatus] = useState<DeckStatus>('loading');
  const [error, setError] = useState<Error>();
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [coldStart, setColdStart] = useState(true);
  const [history, setHistory] = useState<DeckCard[]>([]);
  const [attempt, setAttempt] = useState(0);

  /** Every product we know about (candidates + previously swiped), for profile rebuilds. */
  const known = useRef(new Map<string, Product>());
  const bands = useRef<PriceBands>({});

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const repo = getProductRepository();
    const { swipes } = useSwipeStore.getState();
    const swipedIds = selectSwipedIds({ swipes });

    (async () => {
      const [candidates, swipedProducts, priceBands] = await Promise.all([
        repo.listProducts({ categoryId, subcategoryId, excludeIds: swipedIds }),
        repo.getProducts([...swipedIds]),
        repo.getPriceBands(),
      ]);
      if (cancelled) return;
      for (const p of [...candidates, ...swipedProducts]) known.current.set(p.id, p);
      bands.current = priceBands;
      const profile = buildTasteProfile(swipes, known.current, priceBands, undefined, picks());
      const ranked = rankProducts(candidates, profile, {
        bands: priceBands,
        seed: hashSeed(`${deckKey}:${swipes.length}`),
      });
      setCards(ranked.map(toCard));
      setColdStart(isColdStart(profile));
      setHistory([]);
      setStatus('ready');
    })().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, categoryId, subcategoryId, deckKey, attempt]);

  const swipe = useCallback(
    (direction: SwipeDirection) => {
      const [top, ...rest] = cards;
      if (!top) return;
      recordSwipe({ id: newId(), productId: top.product.id, categoryId, direction, swipedAt: Date.now() });
      const { swipes } = useSwipeStore.getState();
      const profile = buildTasteProfile(swipes, known.current, bands.current, undefined, picks());
      const next = rerankQueue(rest, profile, {
        bands: bands.current,
        seed: hashSeed(`${deckKey}:${swipes.length}`),
      });
      setCards(next.map(toCard));
      setColdStart(isColdStart(profile));
      setHistory((h) => [...h, top]);
    },
    [cards, categoryId, deckKey, recordSwipe],
  );

  const lastInSession = history.at(-1);
  const canUndo = lastInSession !== undefined;

  const undo = useCallback(() => {
    if (!lastInSession) return;
    const last = useSwipeStore.getState().swipes.at(-1);
    // Only undo if the newest swipe is still the one this deck made.
    if (last?.productId !== lastInSession.product.id) {
      setHistory([]);
      return;
    }
    undoLastSwipe();
    const profile = buildTasteProfile(
      useSwipeStore.getState().swipes,
      known.current,
      bands.current,
      undefined,
      picks(),
    );
    setCards((c) => [lastInSession, ...c]);
    setColdStart(isColdStart(profile));
    setHistory((h) => h.slice(0, -1));
  }, [lastInSession, undoLastSwipe]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  return { status, error, cards, coldStart, swipe, undo, canUndo, retry };
}
