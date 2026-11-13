/**
 * Runs sync inside the app: wires the engine to the stores, and decides when
 * to sync (after sign-in, shortly after each change, when the app comes back
 * to the front, and when the connection returns).
 */
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';

import { getSupabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useOutboxStore } from '@/store/outboxStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { claimLocalLearningData, clearLocalLearningData } from '@/store/localLearningData';
import { useSwipeStore } from '@/store/swipeStore';
import { whenHydrated } from '@/store/useHydrated';
import { useWishlistStore } from '@/store/wishlistStore';
import { runSync, type SyncLocal } from './engine';
import { onOpsRecorded } from './record';
import { SupabaseSyncRemote } from './supabaseRemote';
import type { LocalState } from './types';

const appLocal: SyncLocal = {
  getState: (): LocalState => {
    const { swipes, saved } = useSwipeStore.getState();
    const { lists } = useWishlistStore.getState();
    const { stylePicks, onboarded } = usePreferencesStore.getState();
    return { swipes, saved, lists, profile: { stylePicks, onboarded } };
  },
  replaceState: (s) => {
    // Plain setState: these are the account's facts arriving, not new user actions, so nothing is re-queued.
    useSwipeStore.setState({ swipes: s.swipes, saved: s.saved });
    useWishlistStore.setState({ lists: s.lists });
    usePreferencesStore.setState({ stylePicks: s.profile.stylePicks, onboarded: s.profile.onboarded });
  },
  queue: () => useOutboxStore.getState().queue,
  enqueue: (ops) => useOutboxStore.getState().enqueue(ops),
  dequeue: (id) => useOutboxStore.getState().dequeue(id),
  syncedUserId: () => useOutboxStore.getState().syncedUserId,
  setSyncedUserId: (id) => useOutboxStore.getState().setSyncedUserId(id),
};

let running: Promise<void> | null = null;
let again = false;

/** Sync now (one at a time; a request during a sync runs once more afterwards). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    // Never sync before saved data has loaded, or loading could overwrite fresh account data.
    await whenHydrated();
    do {
      again = false;
      const db = getSupabase();
      const { status, userId } = useAuthStore.getState();
      if (!db || status !== 'signedIn' || !userId) return;
      // Another account's on-phone learning data (signals, facts, snapshots) never carries over.
      claimLocalLearningData(userId);
      const result = await runSync(userId, appLocal, new SupabaseSyncRemote(db));
      if (result.status === 'synced') useOutboxStore.getState().markSynced();
      else useOutboxStore.getState().markOffline();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Sync shortly, batching quick bursts of swipes into one trip. */
export function requestSync(delayMs = 1500): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow().catch(() => {});
  }, delayMs);
}

/** Start background syncing. Returns a function that stops it. */
export function startSyncTriggers(): () => void {
  const offRecorded = onOpsRecorded(() => requestSync());
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'active') requestSync(300);
  });
  const network = addNetworkStateListener((n) => {
    if (n.isConnected && n.isInternetReachable !== false) requestSync(300);
  });
  return () => {
    offRecorded();
    appState.remove();
    network.remove();
    if (timer) clearTimeout(timer);
  };
}

/** Forget everything on this phone (used after signing out or deleting the account). */
export function clearLocalAccountData(): void {
  useSwipeStore.setState({ swipes: [], saved: [] });
  useWishlistStore.setState({ lists: [] });
  usePreferencesStore.setState({ stylePicks: [], onboarded: false });
  useOutboxStore.getState().reset();
  // Signals, Your taste answers, product facts and Kept snapshots belong to the signed-out account.
  clearLocalLearningData();
}
