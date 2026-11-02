import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { QueuedOp, SyncOp } from '@/sync/types';

interface OutboxState {
  /** Changes waiting to be sent to the account, oldest first. */
  queue: QueuedOp[];
  /** The account this phone has already merged its history into. */
  syncedUserId: string | null;
  lastSyncedAt: number | null;
  /** Set while the last attempt couldn't reach the account. */
  offline: boolean;
  enqueue: (ops: SyncOp[]) => void;
  dequeue: (id: string) => void;
  setSyncedUserId: (id: string | null) => void;
  markSynced: () => void;
  markOffline: () => void;
  reset: () => void;
}

let seq = 0;

/** The offline queue. Survives app restarts so nothing is lost. */
export const useOutboxStore = create<OutboxState>()(
  persist(
    (set) => ({
      queue: [],
      syncedUserId: null,
      lastSyncedAt: null,
      offline: false,
      enqueue: (ops) =>
        set((s) => ({
          queue: [...s.queue, ...ops.map((op) => ({ id: `${Date.now()}-${seq++}`, op, queuedAt: Date.now() }))],
        })),
      dequeue: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
      setSyncedUserId: (syncedUserId) => set({ syncedUserId }),
      markSynced: () => set({ lastSyncedAt: Date.now(), offline: false }),
      markOffline: () => set({ offline: true }),
      reset: () => set({ queue: [], syncedUserId: null, lastSyncedAt: null, offline: false }),
    }),
    {
      name: 'swipeshop.outbox.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ queue: s.queue, syncedUserId: s.syncedUserId, lastSyncedAt: s.lastSyncedAt }),
    },
  ),
);
