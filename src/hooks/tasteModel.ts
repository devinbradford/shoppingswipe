import type { Product } from '@/domain/types';
import { ROOMS } from '@/data/rooms';
import { buildTasteModel, roomSeeds, withHistoricalFacts, type PriceBands, type TasteModel } from '@/recommendation';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useProductFactsStore } from '@/store/productFactsStore';
import { useSignalStore } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';

/**
 * The shopper's taste right now, rebuilt from everything stored on the phone. Every consumer
 * (For you deck, Your taste, Weekly 10, product page) goes through here, so all of them read the
 * same history: live catalog records first, and saved facts for anything the shopper reacted to
 * that the catalog no longer returns (inactive products keep counting).
 */
export function currentTasteModel(known: ReadonlyMap<string, Product>, bands: PriceBands): TasteModel {
  const { signals, feedback } = useSignalStore.getState();
  const prefs = usePreferencesStore.getState();
  const products = withHistoricalFacts(known, useProductFactsStore.getState().facts, engagedProductIds());
  return buildTasteModel({
    swipes: useSwipeStore.getState().swipes,
    products,
    bands,
    signals,
    feedback,
    // Room answers replace the older style picks as the starting point when there are any.
    seedStyles: prefs.roomAnswers.length ? [] : prefs.stylePicks,
    seedFeatures: roomSeeds(prefs.roomAnswers, ROOMS),
    statedBudget: prefs.budget,
  });
}

/** Read before a catalog lookup for the taste model; pass it to `rememberFacts` with the result. */
export function factsEpoch(): number {
  return useProductFactsStore.getState().epoch;
}

/**
 * A catalog lookup succeeded: save the attributes of the products the shopper has reacted to, so
 * they keep counting if the catalog stops returning them. Ignored if a sign-out or reset happened
 * since `epoch` was read; only products still in the swipe log or signals are written.
 */
export function rememberFacts(products: readonly Product[], epoch: number): void {
  if (products.length === 0) return;
  useProductFactsStore.getState().remember(products, epoch, new Set(engagedProductIds()));
}

/** Ids of every product the shopper has interacted with (needed to rebuild their taste). */
export function engagedProductIds(): string[] {
  const { swipes } = useSwipeStore.getState();
  const { signals, feedback } = useSignalStore.getState();
  return [
    ...new Set([
      ...swipes.map((s) => s.productId),
      ...signals.map((s) => s.productId),
      ...feedback.flatMap((f) => (f.kind === 'skip_reason' ? [f.productId] : [])),
    ]),
  ];
}
