/**
 * Called by the stores after every change. When someone is signed in, the
 * change goes into the outbox and a sync is requested; otherwise nothing
 * happens (the phone is the only copy until they sign in).
 */
import { useAuthStore } from '@/store/authStore';
import { useOutboxStore } from '@/store/outboxStore';
import type { SyncOp } from './types';

type Listener = () => void;
const listeners = new Set<Listener>();

export function recordOps(ops: SyncOp[]): void {
  if (ops.length === 0) return;
  if (useAuthStore.getState().status !== 'signedIn') return;
  useOutboxStore.getState().enqueue(ops);
  listeners.forEach((l) => l());
}

/** Lets the sync scheduler hear about new changes without the stores depending on it. */
export function onOpsRecorded(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
