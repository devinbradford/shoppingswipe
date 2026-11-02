import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Wishlist } from '@/domain/types';
import { addToList, createList, deleteList, removeFromList, renameList } from '@/domain/wishlists';
import { isUuid, newId } from '@/lib/ids';

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
      // v2: lists pointing at the old (pre-furniture) sample catalog were cleared.
      // v3: list ids become UUIDs so they can sync.
      version: 3,
      migrate: (persisted, version) => {
        if (version < 2) return { lists: [] };
        const lists = (persisted as { lists?: Wishlist[] }).lists ?? [];
        return { lists: lists.map((l) => (isUuid(l.id) ? l : { ...l, id: newId() })) };
      },
      partialize: (s) => ({ lists: s.lists }),
    },
  ),
);
