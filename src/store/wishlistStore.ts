import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Wishlist } from '@/domain/types';
import { addToList, createList, deleteList, removeFromList, renameList } from '@/domain/wishlists';

type Result = { ok: true; id: string } | { ok: false; error: string };

interface WishlistState {
  lists: Wishlist[];
  create: (name: string) => Result;
  rename: (id: string, name: string) => Result;
  remove: (id: string) => void;
  add: (id: string, productIds: readonly string[]) => void;
  removeItems: (id: string, productIds: readonly string[]) => void;
  resetAll: () => void;
}

function newId(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Named wishlists. Rules live in `@/domain/wishlists`; this only stores the results. */
export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      lists: [],
      create: (name) => {
        const r = createList(get().lists, name, newId(), Date.now());
        if (!r.ok) return r;
        set({ lists: r.lists });
        return { ok: true, id: r.id };
      },
      rename: (id, name) => {
        const r = renameList(get().lists, id, name);
        if (!r.ok) return r;
        set({ lists: r.lists });
        return { ok: true, id };
      },
      remove: (id) => set((s) => ({ lists: deleteList(s.lists, id) })),
      add: (id, productIds) => set((s) => ({ lists: addToList(s.lists, id, productIds, Date.now()) })),
      removeItems: (id, productIds) => set((s) => ({ lists: removeFromList(s.lists, id, productIds) })),
      resetAll: () => set({ lists: [] }),
    }),
    {
      name: 'swipeshop.wishlists.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // v2: lists pointing at the old (pre-furniture) sample catalog are cleared once.
      version: 2,
      migrate: () => ({ lists: [] }),
      partialize: (s) => ({ lists: s.lists }),
    },
  ),
);
