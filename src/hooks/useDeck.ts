import { useCallback, useEffect, useRef, useState } from 'react';

import { getProductRepository } from '@/data';
import type { CategoryId, Product, SubcategoryId, SwipeDirection } from '@/domain/types';
import {
  cardBadge,
  formatReasons,
  hashSeed,
  isColdStartModel,
  rankDeck,
  reasonLabels,
  rerankDeck,
  type PriceBands,
  type RankedProduct,
  type CardBadge,
  type SessionSwipe,
  type TasteModel,
} from '@/recommendation';
import { deckStatusFor, shouldRefill, type RefillState } from '@/lib/candidatePool';
import { shouldShowFirstActionHint } from '@/lib/firstActionHint';
import { newId } from '@/lib/ids';
import { currentTasteModel } from './tasteModel';
import { recordSignal, useSignalStore } from '@/store/signalStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { selectSwipedIds, useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';

export type DeckStatus = 'loading' | 'ready' | 'error';

export interface DeckCard extends RankedProduct {
  /** "Matches your taste for walnut and mid-century", or null. */
  reasonText: string | null;
  /** Short reasons for the "For you" bubble, e.g. "mid-century, walnut", or null. */
  forYou: string | null;
  /**
   * The pill shown above the name: only what the data can honestly back up (see badge.ts).
   * Separate from `forYou`, which the engine's learning still uses as it always did.
   */
  badge: CardBadge;
}

export interface Deck {
  status: DeckStatus;
  error?: Error;
  /** Cards in order; the first is on top. */
  cards: DeckCard[];
  /** True until the user has kept enough items for personal ranking. */
  coldStart: boolean;
  /** Show the first-action hint on the top card (skipped the rooms, never swiped a product). */
  firstActionHint: boolean;
  swipe: (direction: SwipeDirection) => void;
  undo: () => void;
  canUndo: boolean;
  retry: () => void;
}

const modelFor = currentTasteModel;

const toCard =
  (model: TasteModel, bands: PriceBands) =>
  (r: RankedProduct): DeckCard => {
    const labels = reasonLabels(r.reasons);
    return {
      ...r,
      reasonText: formatReasons(r.reasons),
      forYou: labels.length ? labels.join(', ') : null,
      badge: cardBadge(r, model, bands),
    };
  };

/**
 * The swipe deck for one room (or every room when none is given). Loads unswiped products, ranks them with
 * the taste profile (built from every swipe in every category), and re-ranks
 * everything behind the two visible cards after each swipe.
 */
export function useDeck(
  categoryId?: CategoryId,
  subcategoryId?: SubcategoryId,
  /** Only these products (e.g. this week's 10), in place of a room. */
  onlyIds?: readonly string[],
): Deck {
  const onlyKey = onlyIds?.join(',') ?? null;
  // No room = every room (the For you deck).
  const deckKey = onlyKey !== null ? `only:${onlyKey}` : (subcategoryId ?? categoryId ?? 'all');
  const hydrated = useHydrated();
  const recordSwipe = useSwipeStore((s) => s.recordSwipe);
  const undoLastSwipe = useSwipeStore((s) => s.undoLastSwipe);

  const [status, setStatus] = useState<DeckStatus>('loading');
  const [error, setError] = useState<Error>();
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [coldStart, setColdStart] = useState(true);
  const [history, setHistory] = useState<DeckCard[]>([]);
  const [attempt, setAttempt] = useState(0);
  /** More eligible products exist than have been loaded into this deck so far. */
  const [more, setMore] = useState(false);
  /** The last request for more candidates failed (cleared by a full reload). */
  const [refillFailed, setRefillFailed] = useState(false);
  /** A request for more candidates is on its way. */
  const refilling = useRef(false);
  /** Bumped on every full load, so a refill that comes back after a room switch is ignored. */
  const load = useRef(0);

  /** Every product we know about (candidates + previously swiped), for profile rebuilds. */
  const known = useRef(new Map<string, Product>());
  const bands = useRef<PriceBands>({});
  /** This visit's swipes (their position drives probes and variety in ranking). */
  const session = useRef<SessionSwipe[]>([]);
  /** When the current top card appeared, for how long it was looked at. */
  const shownAt = useRef(0);
  const topId = cards[0]?.product.id;
  useEffect(() => {
    shownAt.current = Date.now();
  }, [topId]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const repo = getProductRepository();
    const { swipes } = useSwipeStore.getState();
    const swipedIds = selectSwipedIds({ swipes });
    const { signals, feedback } = useSignalStore.getState();
    const engagedIds = new Set([
      ...signals.map((s) => s.productId),
      ...feedback.flatMap((f) => (f.kind === 'skip_reason' ? [f.productId] : [])),
    ]);

    const thisLoad = ++load.current;
    refilling.current = false;

    (async () => {
      const [batch, seenProducts, priceBands] = await Promise.all([
        onlyKey !== null
          ? repo
              .getProducts(onlyKey ? onlyKey.split(',') : [])
              .then((ps) => ({ products: ps.filter((p) => !swipedIds.has(p.id)), complete: true }))
          : // A bounded batch drawn from every eligible product; more are fetched as the deck runs low.
            repo.listCandidates({
              categoryId,
              subcategoryId,
              excludeIds: swipedIds,
              seed: hashSeed(`${deckKey}:${swipes.length}:candidates`),
            }),
        repo.getProducts([...new Set([...swipedIds, ...engagedIds])]),
        repo.getPriceBands(),
      ]);
      if (cancelled || thisLoad !== load.current) return;
      const candidates = batch.products;
      for (const p of [...candidates, ...seenProducts]) known.current.set(p.id, p);
      bands.current = priceBands;
      const model = modelFor(known.current, priceBands);
      const ranked = rankDeck(candidates, model, {
        bands: priceBands,
        seed: hashSeed(`${deckKey}:${swipes.length}`),
      });
      session.current = [];
      setCards(ranked.map(toCard(model, priceBands)));
      setColdStart(isColdStartModel(model));
      setHistory([]);
      setMore(!batch.complete);
      setRefillFailed(false);
      setStatus('ready');
    })().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, categoryId, subcategoryId, onlyKey, deckKey, attempt]);

  const swipe = useCallback(
    (direction: SwipeDirection) => {
      const [top, ...rest] = cards;
      if (!top) return;
      const dwellMs = shownAt.current ? Date.now() - shownAt.current : undefined;
      if (dwellMs !== undefined) recordSignal(top.product.id, 'swipe_dwell', dwellMs);
      recordSwipe({
        id: newId(),
        productId: top.product.id,
        categoryId: top.product.categoryId,
        direction,
        swipedAt: Date.now(),
      });
      // The first Keep / Skip went through: the first-action hint is done for good (Undo can't bring it back).
      const prefs = usePreferencesStore.getState();
      if (!prefs.firstActionDone) prefs.markFirstActionDone();
      const { swipes } = useSwipeStore.getState();
      const model = modelFor(known.current, bands.current);
      session.current = [
        ...session.current,
        { product: top.product, direction, dwellMs, predicted: top.score, forYou: top.forYou !== null },
      ];
      const next = rerankDeck(rest, model, {
        bands: bands.current,
        seed: hashSeed(`${deckKey}:${swipes.length}`),
        position: session.current.length,
      });
      setCards(next.map(toCard(model, bands.current)));
      setColdStart(isColdStartModel(model));
      setHistory((h) => [...h, top]);
    },
    [cards, deckKey, recordSwipe],
  );

  // Running low and more eligible products exist: fetch the next batch and add it behind the
  // current cards (the next swipe re-ranks everything behind the two visible cards, as always).
  useEffect(() => {
    const refill: RefillState = refilling.current ? 'loading' : refillFailed ? 'failed' : 'idle';
    if (!shouldRefill({ ready: status === 'ready', more, refill, cardsLeft: cards.length })) return;
    const thisLoad = load.current;
    refilling.current = true;
    const { swipes } = useSwipeStore.getState();
    const exclude = new Set([...selectSwipedIds({ swipes }), ...cards.map((c) => c.product.id)]);
    getProductRepository()
      .listCandidates({
        categoryId,
        subcategoryId,
        excludeIds: exclude,
        seed: hashSeed(`${deckKey}:${swipes.length}:refill`),
      })
      .then((batch) => {
        if (thisLoad !== load.current) return;
        for (const p of batch.products) known.current.set(p.id, p);
        const model = modelFor(known.current, bands.current);
        const ranked = rankDeck(batch.products, model, {
          bands: bands.current,
          seed: hashSeed(`${deckKey}:${swipes.length}:refill`),
        }).map(toCard(model, bands.current));
        setCards((current) => {
          const have = new Set(current.map((c) => c.product.id));
          return [...current, ...ranked.filter((c) => !have.has(c.product.id))];
        });
        // Nothing new came back (only possible if products were switched off since the catalog
        // index was read): stop asking rather than retry the same batch forever.
        setMore(!batch.complete && batch.products.length > 0);
        refilling.current = false;
      })
      .catch(() => {
        if (thisLoad !== load.current) return;
        refilling.current = false;
        setRefillFailed(true);
      });
  }, [status, more, refillFailed, cards, categoryId, subcategoryId, deckKey]);

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
    session.current = session.current.slice(0, -1);
    const model = modelFor(known.current, bands.current);
    setCards((c) => [lastInSession, ...c]);
    setColdStart(isColdStartModel(model));
    setHistory((h) => h.slice(0, -1));
  }, [lastInSession, undoLastSwipe]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  const firstActionDone = usePreferencesStore((s) => s.firstActionDone);
  const roomAnswerCount = usePreferencesStore((s) => s.roomAnswers.length);
  const swipeCount = useSwipeStore((s) => s.swipes.length);
  const firstActionHint = hydrated && shouldShowFirstActionHint({ firstActionDone, roomAnswerCount, swipeCount });

  // An empty deck with more on the way reads as loading (deckStatusFor), never "seen everything".
  const shownStatus = deckStatusFor({ status, cardsLeft: cards.length, more, refill: refillFailed ? 'failed' : 'idle' });
  const shownError = shownStatus === 'error' && status !== 'error' ? new Error('Could not load more products') : error;
  return { status: shownStatus, error: shownError, cards, coldStart, firstActionHint, swipe, undo, canUndo, retry };
}
