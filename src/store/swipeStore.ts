import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SavedItem, SwipeEvent } from '@/domain/types';

/**
 * On-device record of what the user did. Facts only: the swipe log and the
 * kept list. All ranking happens in `src/recommendation`, rebuilt from this log.
 */
interface SwipeState {
  swipes: SwipeEvent[];
  saved: SavedItem[];
  /** Log a swipe. A keep also adds the product to the kept list. */
  recordSwipe: (event: SwipeEvent) => void;
  /** Remove the most recent swipe (and its keep), returning it. */
  undoLastSwipe: () => SwipeEvent | undefined;
  /** Remove a product from the kept list. The swipe log is left untouched. */
  removeSaved: (productId: string) => void;
  /** Add to the kept list without swiping (e.g. from the detail screen). */
  addSaved: (productId: string) => void;
  resetAll: () => void;
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      swipes: [],
      saved: [],
      recordSwipe: (event) =>
        set((s) => ({
          swipes: [...s.swipes, event],
          saved:
            event.direction === 'keep' && !s.saved.some((i) => i.productId === event.productId)
              ? [{ productId: event.productId, savedAt: event.swipedAt }, ...s.saved]
              : s.saved,
        })),
      undoLastSwipe: () => {
        const last = get().swipes.at(-1);
        if (!last) return undefined;
        set((s) => ({
          swipes: s.swipes.slice(0, -1),
          saved:
            last.direction === 'keep'
              ? s.saved.filter((i) => !(i.productId === last.productId && i.savedAt === last.swipedAt))
              : s.saved,
        }));
        return last;
      },
      removeSaved: (productId) => set((s) => ({ saved: s.saved.filter((i) => i.productId !== productId) })),
      addSaved: (productId) =>
        set((s) =>
          s.saved.some((i) => i.productId === productId)
            ? s
            : { saved: [{ productId, savedAt: Date.now() }, ...s.saved] },
        ),
      resetAll: () => set({ swipes: [], saved: [] }),
    }),
    {
      name: 'swipeshop.swipes.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ swipes: s.swipes, saved: s.saved }),
    },
  ),
);

/** Ids of every product the user has swiped on, in any category. */
export function selectSwipedIds(state: Pick<SwipeState, 'swipes'>): Set<string> {
  return new Set(state.swipes.map((s) => s.productId));
}
