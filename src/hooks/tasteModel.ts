import type { Product } from '@/domain/types';
import { buildTasteModel, type PriceBands, type TasteModel } from '@/recommendation';
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
    seedStyles: prefs.stylePicks,
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
