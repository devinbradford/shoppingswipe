import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { addPurchase, canAskAboutPurchase, markAsked, type Purchase } from '@/domain/purchases';

/** A store visit we may ask about once they're back in the app. */
export interface StoreVisit {
  productId: string;
  title: string;
  storeName: string;
}

/**
 * What they told us they bought, and which products we've already asked about.
 * Facts only. On this phone for now (not synced to the account yet).
 */
interface PurchaseState {
  bought: Purchase[];
  asked: string[];
  /** Back from the store and not asked yet. Not saved: the question only makes sense right away. */
  pending: StoreVisit | null;
  /** They're back from the store: queue the question if we haven't asked about this piece before. */
  returnedFrom: (visit: StoreVisit) => void;
  answer: (productId: string, bought: boolean) => void;
  dismiss: () => void;
  resetAll: () => void;
}

export const usePurchaseStore = create<PurchaseState>()(
  persist(
    (set, get) => ({
      bought: [],
      asked: [],
      pending: null,
      returnedFrom: (visit) => {
        const { bought, asked } = get();
        if (!canAskAboutPurchase(visit.productId, bought, asked)) return;
        set({ pending: visit, asked: markAsked(asked, visit.productId) });
      },
      answer: (productId, didBuy) =>
        set((s) => ({
          pending: null,
          bought: didBuy ? addPurchase(s.bought, productId, Date.now()) : s.bought,
        })),
      dismiss: () => set({ pending: null }),
      resetAll: () => set({ bought: [], asked: [], pending: null }),
    }),
    {
      name: 'swipeshop.purchases.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ bought: s.bought, asked: s.asked }),
    },
  ),
);
