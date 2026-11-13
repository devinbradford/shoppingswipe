import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { refreshChanges, savedNow, seen, sweepSnapshots, type ProductSnapshot } from '@/domain/availability';
import type { Product } from '@/domain/types';

/**
 * What the app last saw of each saved / listed / bought product (P1-2), so a product the catalog
 * stops returning stays visible as "Unavailable on CureAvo" instead of vanishing. On this phone
 * only (not synced); never holds a purchase link. Rules live in `@/domain/availability`.
 *
 * Account boundary: snapshots belong to whoever owns the data on this phone. `owner` is the
 * signed-in account they were made for (null = nobody signed in). Signing out clears them, and
 * a different account syncing onto this phone starts with none. `epoch` changes on every clear,
 * so a catalog response that started before a sign-out or reset can't write into the new state.
 */
interface SnapshotState {
  snapshots: Record<string, ProductSnapshot>;
  owner: string | null;
  /** Not saved: bumped on every clear, read by callers before a lookup starts. */
  epoch: number;
  /** A save just happened on this phone: records the price for that save (`savedAt`). */
  rememberSave: (product: Product, savedAt: number, retailerName?: string) => void;
  /** The product was seen (added to a list, store visited): display fields and last-known price. */
  remember: (product: Product, retailerName?: string) => void;
  /**
   * A catalog lookup that started at `epoch` succeeded: refresh these products. Only ids in
   * `stillReferenced` (read at write time) are written, so a late answer can't add strays.
   */
  refreshFromCatalog: (
    products: readonly Product[],
    epoch: number,
    stillReferenced: ReadonlySet<string>,
    retailerNames?: ReadonlyMap<string, string>,
  ) => void;
  /** Mark-and-sweep clean-up (see `sweepSnapshots`). */
  sweep: (referenced: ReadonlySet<string>, now?: number) => void;
  /** An account is about to sync onto this phone: another account's snapshots never carry over. */
  claimFor: (userId: string) => void;
  resetAll: () => void;
}

export const useSnapshotStore = create<SnapshotState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      owner: null,
      epoch: 0,
      rememberSave: (product, savedAt, retailerName) =>
        set((s) => ({
          snapshots: { ...s.snapshots, [product.id]: savedNow(s.snapshots[product.id], product, savedAt, Date.now(), retailerName) },
        })),
      remember: (product, retailerName) =>
        set((s) => ({
          snapshots: { ...s.snapshots, [product.id]: seen(s.snapshots[product.id], product, Date.now(), retailerName) },
        })),
      refreshFromCatalog: (products, epoch, stillReferenced, retailerNames) => {
        if (epoch !== get().epoch) return;
        const now = Date.now();
        const prev = get().snapshots;
        const updates: Record<string, ProductSnapshot> = {};
        for (const p of products) {
          if (!stillReferenced.has(p.id) || !refreshChanges(prev[p.id], p, now)) continue;
          updates[p.id] = seen(prev[p.id], p, now, retailerNames?.get(p.retailerId));
        }
        if (Object.keys(updates).length) set((s) => ({ snapshots: { ...s.snapshots, ...updates } }));
      },
      sweep: (referenced, now = Date.now()) => {
        const next = sweepSnapshots(get().snapshots, referenced, now);
        if (next) set({ snapshots: next });
      },
      claimFor: (userId) => {
        const { owner } = get();
        if (owner === userId) return;
        // Snapshots made while signed out belong to the data being merged into this account;
        // another account's never do.
        if (owner !== null) set((s) => ({ snapshots: {}, epoch: s.epoch + 1 }));
        set({ owner: userId });
      },
      resetAll: () => set((s) => ({ snapshots: {}, owner: null, epoch: s.epoch + 1 })),
    }),
    {
      name: 'cureavo.snapshots.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ snapshots: s.snapshots, owner: s.owner }),
    },
  ),
);

/** A save just happened: snapshot it with the save's own time, read back from the kept list. */
export function rememberSavedProduct(product: Product, savedAt: number | undefined, retailerName?: string): void {
  if (savedAt === undefined) useSnapshotStore.getState().remember(product, retailerName);
  else useSnapshotStore.getState().rememberSave(product, savedAt, retailerName);
}
