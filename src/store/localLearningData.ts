/**
 * One place for the lifecycle of learning data that lives only on this phone (not synced):
 * engagement signals and Your taste answers, historical product facts, and Kept snapshots.
 *
 * These are cleared only by explicit operations, never as a side effect of another store
 * changing (e.g. the swipe list becoming empty after Undo or a sync).
 */
import { useProductFactsStore } from './productFactsStore';
import { useSnapshotStore } from './productSnapshotStore';
import { useSignalStore } from './signalStore';

/** Sign out, delete account, Profile → Reset: forget all of it. */
export function clearLocalLearningData(): void {
  useSignalStore.getState().resetAll();
  useProductFactsStore.getState().resetAll();
  useSnapshotStore.getState().resetAll();
}

/**
 * An account is about to sync onto this phone. Data made while signed out goes with the history
 * being merged into it; another account's never carries over. The owner is recorded once, on the
 * snapshot store (P1-2), and read here for all three.
 */
export function claimLocalLearningData(userId: string): void {
  const { owner } = useSnapshotStore.getState();
  if (owner !== null && owner !== userId) {
    useSignalStore.getState().resetAll();
    useProductFactsStore.getState().resetAll();
  }
  useSnapshotStore.getState().claimFor(userId);
}
