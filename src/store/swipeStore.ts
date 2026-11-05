import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SavedItem, SwipeEvent } from '@/domain/types';
import { newId } from '@/lib/ids';
import { recordOps } from '@/sync/record';
import type { SyncOp } from '@/sync/types';

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
  /** Put a removed item back exactly where it was (Undo). */
  restoreSaved: (item: SavedItem) => void;
  resetAll: () => void;
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      swipes: [],
      saved: [],
      recordSwipe: (event) => {
        const newlyKept = event.direction === 'keep' && !get().saved.some((i) => i.productId === event.productId);
        const item = { productId: event.productId, savedAt: event.swipedAt };
        set((s) => ({ swipes: [...s.swipes, event], saved: newlyKept ? [item, ...s.saved] : s.saved }));
        const ops: SyncOp[] = [{ type: 'swipe.add', swipe: event }];
        if (newlyKept) ops.push({ type: 'saved.add', item });
        recordOps(ops);
      },
      undoLastSwipe: () => {
        const last = get().swipes.at(-1);
        if (!last) return undefined;
        const unkeeps =
          last.direction === 'keep' &&
          get().saved.some((i) => i.productId === last.productId && i.savedAt === last.swipedAt);
        set((s) => ({
          swipes: s.swipes.slice(0, -1),
          saved:
            last.direction === 'keep'
              ? s.saved.filter((i) => !(i.productId === last.productId && i.savedAt === last.swipedAt))
              : s.saved,
        }));
        const ops: SyncOp[] = [{ type: 'swipe.remove', swipeId: last.id }];
        if (unkeeps) ops.push({ type: 'saved.remove', productId: last.productId });
        recordOps(ops);
        return last;
      },
      removeSaved: (productId) => {
        set((s) => ({ saved: s.saved.filter((i) => i.productId !== productId) }));
        recordOps([{ type: 'saved.remove', productId }]);
      },
      addSaved: (productId) => {
        if (get().saved.some((i) => i.productId === productId)) return;
        const item = { productId, savedAt: Date.now() };
        set((s) => ({ saved: [item, ...s.saved] }));
        recordOps([{ type: 'saved.add', item }]);
      },
      restoreSaved: (item) => {
        if (get().saved.some((i) => i.productId === item.productId)) return;
        // The kept list is newest first.
        set((s) => ({ saved: [...s.saved, item].sort((a, b) => b.savedAt - a.savedAt) }));
        recordOps([{ type: 'saved.add', item }]);
      },
      resetAll: () => set({ swipes: [], saved: [] }),
    }),
    {
      name: 'swipeshop.swipes.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // v2: the catalog became furniture-only, so older swipes and kept items were cleared.
      // v3: every swipe carries an id (for syncing); older swipes get one.
      version: 3,
      migrate: (persisted, version) => {
        if (version < 2) return { swipes: [], saved: [] };
        const s = persisted as { swipes?: Omit<SwipeEvent, 'id'>[]; saved?: SavedItem[] };
        return {
          swipes: (s.swipes ?? []).map((e) => ({ id: newId(), ...e })),
          saved: s.saved ?? [],
        };
      },
      partialize: (s) => ({ swipes: s.swipes, saved: s.saved }),
    },
  ),
);

/** Ids of every product the user has swiped on, in any category. */
export function selectSwipedIds(state: Pick<SwipeState, 'swipes'>): Set<string> {
  return new Set(state.swipes.map((s) => s.productId));
}
