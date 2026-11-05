import { useCallback, useEffect, useRef, useState } from 'react';

import { getProductRepository } from '@/data';
import type { CategoryId, Product, SubcategoryId, SwipeDirection } from '@/domain/types';
import {
  buildTasteModel,
  EMPTY_QUESTION_STATE,
  formatReasons,
  hashSeed,
  isColdStartModel,
  markAsked,
  nextQuestion,
  rankDeck,
  reasonLabels,
  rerankDeck,
  type PriceBands,
  type Question,
  type QuestionState,
  type RankedProduct,
  type SessionSwipe,
  type SkipReason,
} from '@/recommendation';
import { newId } from '@/lib/ids';
import { usePreferencesStore } from '@/store/preferencesStore';
import { recordSignal, useSignalStore } from '@/store/signalStore';
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
  /** A quick question after a telling skip, or null. Shown briefly; ignoring it is fine. */
  question: Question | null;
  /** Feature questions: 'less' or 'fine'. "What put you off?": a SkipReason. */
  answerQuestion: (answer: 'less' | 'fine' | SkipReason) => void;
  /** The question faded or was closed without an answer. */
  dismissQuestion: () => void;
}

/** Styles picked on first launch. */
const picks = () => usePreferencesStore.getState().stylePicks;

function modelFor(known: ReadonlyMap<string, Product>, bands: PriceBands) {
  const { signals, feedback } = useSignalStore.getState();
  return buildTasteModel({
    swipes: useSwipeStore.getState().swipes,
    products: known,
    bands,
    signals,
    feedback,
    seedStyles: picks(),
    statedBudget: usePreferencesStore.getState().budget,
  });
}

function toCard(r: RankedProduct): DeckCard {
  const labels = reasonLabels(r.reasons);
  return { ...r, reasonText: formatReasons(r.reasons), forYou: labels.length ? labels.join(', ') : null };
}

/**
 * The swipe deck for one room (or every room when none is given). Loads unswiped products, ranks them with
 * the taste profile (built from every swipe in every category), and re-ranks
 * everything behind the two visible cards after each swipe.
 */
export function useDeck(categoryId?: CategoryId, subcategoryId?: SubcategoryId): Deck {
  // No room = every room (the For you deck).
  const deckKey = subcategoryId ?? categoryId ?? 'all';
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
  /** This visit's swipes, for deciding when to ask a question. */
  const session = useRef<SessionSwipe[]>([]);
  const questionState = useRef<QuestionState>(EMPTY_QUESTION_STATE);
  const [question, setQuestion] = useState<Question | null>(null);
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

    (async () => {
      const [candidates, seenProducts, priceBands] = await Promise.all([
        repo.listProducts({ categoryId, subcategoryId, excludeIds: swipedIds }),
        repo.getProducts([...new Set([...swipedIds, ...engagedIds])]),
        repo.getPriceBands(),
      ]);
      if (cancelled) return;
      for (const p of [...candidates, ...seenProducts]) known.current.set(p.id, p);
      bands.current = priceBands;
      const model = modelFor(known.current, priceBands);
      const ranked = rankDeck(candidates, model, {
        bands: priceBands,
        seed: hashSeed(`${deckKey}:${swipes.length}`),
      });
      session.current = [];
      questionState.current = EMPTY_QUESTION_STATE;
      setQuestion(null);
      setCards(ranked.map(toCard));
      setColdStart(isColdStartModel(model));
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
      const dwellMs = shownAt.current ? Date.now() - shownAt.current : undefined;
      if (dwellMs !== undefined) recordSignal(top.product.id, 'swipe_dwell', dwellMs);
      recordSwipe({
        id: newId(),
        productId: top.product.id,
        categoryId: top.product.categoryId,
        direction,
        swipedAt: Date.now(),
      });
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
      setCards(next.map(toCard));
      setColdStart(isColdStartModel(model));
      setHistory((h) => [...h, top]);

      // A question still showing when they swipe on counts as ignored.
      let qs = questionState.current;
      if (question) qs = { ...qs, ignoredStreak: qs.ignoredStreak + 1 };
      const q = nextQuestion(session.current, model, bands.current, qs);
      if (q) qs = markAsked(qs, q, session.current.length);
      questionState.current = qs;
      setQuestion(q);
    },
    [cards, deckKey, recordSwipe, question],
  );

  const answerQuestion = useCallback(
    (answer: 'less' | 'fine' | SkipReason) => {
      if (!question) return;
      const store = useSignalStore.getState();
      if (question.type === 'feature' && (answer === 'less' || answer === 'fine')) {
        store.answerFeature(question.featureKey, answer);
      } else if (question.type === 'why' && answer !== 'less' && answer !== 'fine') {
        store.answerSkipReason(question.productId, answer);
      }
      questionState.current = { ...questionState.current, ignoredStreak: 0 };
      setQuestion(null);
      // Apply the answer straight away, behind the cards already on screen.
      const { swipes } = useSwipeStore.getState();
      const model = modelFor(known.current, bands.current);
      setCards((c) =>
        rerankDeck(c, model, {
          bands: bands.current,
          seed: hashSeed(`${deckKey}:${swipes.length}:answer`),
          position: session.current.length,
        }).map(toCard),
      );
    },
    [question, deckKey],
  );

  const dismissQuestion = useCallback(() => {
    if (!question) return;
    questionState.current = { ...questionState.current, ignoredStreak: questionState.current.ignoredStreak + 1 };
    setQuestion(null);
  }, [question]);

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
    setQuestion(null);
    const model = modelFor(known.current, bands.current);
    setCards((c) => [lastInSession, ...c]);
    setColdStart(isColdStartModel(model));
    setHistory((h) => h.slice(0, -1));
  }, [lastInSession, undoLastSwipe]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  return { status, error, cards, coldStart, swipe, undo, canUndo, retry, question, answerQuestion, dismissQuestion };
}
