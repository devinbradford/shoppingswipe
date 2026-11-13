import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sweepSnapshots } from '@/domain/availability';
import type { Product } from '@/domain/types';
import { factsChanged, factsOf, type ProductFacts } from '@/recommendation/historicalFacts';

/**
 * The attributes the taste model reads, saved for every product the shopper reacted to, so their
 * history keeps counting after the catalog stops returning a product (see `historicalFacts.ts`).
 * On this phone only (not synced); no names, photos or links.
 *
 * Lifecycle is shared with the other on-phone learning data (`localLearningData.ts`): cleared on
 * sign-out, account deletion and Profile → Reset, and when another account syncs onto the phone.
 * `epoch` changes on every clear, so a catalog lookup that started before a clear writes nothing.
 */
interface FactsState {
  facts: Record<string, ProductFacts>;
  /** Not saved: bumped on every clear. Read it before a lookup starts; pass it back with the result. */
  epoch: number;
  /**
   * Save (or refresh) facts for these products, which the catalog just returned. Only ids in
   * `stillReferenced` (read at write time) are written, and nothing if a clear happened since
   * `epoch` was read. Writes only when something the engine reads actually changed.
   */
  remember: (products: readonly Product[], epoch: number, stillReferenced: ReadonlySet<string>) => void;
  /** Mark-and-sweep clean-up against everything the swipe log and signals still point at. */
  sweep: (referenced: ReadonlySet<string>, now?: number) => void;
  resetAll: () => void;
}

export const useProductFactsStore = create<FactsState>()(
  persist(
    (set, get) => ({
      facts: {},
      epoch: 0,
      remember: (products, epoch, stillReferenced) => {
        if (epoch !== get().epoch) return;
        const now = Date.now();
        const prev = get().facts;
        const updates: Record<string, ProductFacts> = {};
        for (const p of products) {
          if (!stillReferenced.has(p.id) || !factsChanged(prev[p.id], p)) continue;
          updates[p.id] = factsOf(p, now);
        }
        if (Object.keys(updates).length) set((s) => ({ facts: { ...s.facts, ...updates } }));
      },
      sweep: (referenced, now = Date.now()) => {
        const next = sweepSnapshots(get().facts, referenced, now);
        if (next) set({ facts: next });
      },
      resetAll: () => set((s) => ({ facts: {}, epoch: s.epoch + 1 })),
    }),
    {
      name: 'cureavo.productFacts.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ facts: s.facts }),
    },
  ),
);
