import { useCallback } from 'react';

import { usePurchaseStore } from '@/store/purchaseStore';
import { recordSignal } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';

/** The "Did you buy it?" question after a store visit, and what each answer does. */
export function usePurchasePrompt() {
  const visit = usePurchaseStore((s) => s.pending);
  const answer = usePurchaseStore((s) => s.answer);
  const dismiss = usePurchaseStore((s) => s.dismiss);

  const bought = useCallback(() => {
    if (!visit) return;
    answer(visit.productId, true);
    recordSignal(visit.productId, 'purchase');
    // Bought pieces live on Kept (with a Bought tag), even if they were never swiped right.
    useSwipeStore.getState().addSaved(visit.productId);
  }, [visit, answer]);

  const notYet = useCallback(() => {
    if (visit) answer(visit.productId, false);
  }, [visit, answer]);

  return { visit, bought, notYet, dismiss };
}

/** Ids of everything they told us they bought. */
export function useBoughtIds(): ReadonlySet<string> {
  const bought = usePurchaseStore((s) => s.bought);
  return new Set(bought.map((b) => b.productId));
}
