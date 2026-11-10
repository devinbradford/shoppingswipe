import type { Product } from '@/domain/types';
import { ROOMS } from '@/data/rooms';
import { buildTasteModel, roomSeeds, type PriceBands, type TasteModel } from '@/recommendation';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSignalStore } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';

/** The shopper's taste right now, rebuilt from everything stored on the phone. */
export function currentTasteModel(known: ReadonlyMap<string, Product>, bands: PriceBands): TasteModel {
  const { signals, feedback } = useSignalStore.getState();
  const prefs = usePreferencesStore.getState();
  return buildTasteModel({
    swipes: useSwipeStore.getState().swipes,
    products: known,
    bands,
    signals,
    feedback,
    // Room answers replace the older style picks as the starting point when there are any.
    seedStyles: prefs.roomAnswers.length ? [] : prefs.stylePicks,
    seedFeatures: roomSeeds(prefs.roomAnswers, ROOMS),
    statedBudget: prefs.budget,
  });
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
