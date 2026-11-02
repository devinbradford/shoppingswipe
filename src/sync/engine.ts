/**
 * One sync pass: (1) on a first sign-in on this phone, queue everything local;
 * (2) send queued changes in order; (3) if they all went through, fetch the
 * account and make it the local state (re-applying anything queued meanwhile).
 */
import { snapshotToOps, localFromSnapshot } from './local';
import { PermanentSyncError, type LocalState, type QueuedOp, type SyncOp, type SyncRemote } from './types';

/** What the engine needs from the phone. The app wires this to its stores; tests use plain objects. */
export interface SyncLocal {
  getState(): LocalState;
  replaceState(state: LocalState): void;
  queue(): QueuedOp[];
  enqueue(ops: SyncOp[]): void;
  dequeue(id: string): void;
  /** The user this phone last finished a sync for. */
  syncedUserId(): string | null;
  setSyncedUserId(id: string): void;
}

export type SyncResult =
  | { status: 'synced'; sent: number; dropped: number }
  | { status: 'offline'; sent: number; dropped: number; pending: number; error: unknown };

export async function runSync(userId: string, local: SyncLocal, remote: SyncRemote): Promise<SyncResult> {
  if (local.syncedUserId() !== userId) {
    // First sync for this account on this phone: merge in what was done before signing in.
    local.enqueue(snapshotToOps(local.getState()));
    // Mark it straight away so a failed sync doesn't queue the same history twice.
    local.setSyncedUserId(userId);
  }

  let sent = 0;
  let dropped = 0;
  for (const queued of local.queue()) {
    try {
      await remote.apply(queued.op);
      sent++;
      local.dequeue(queued.id);
    } catch (error) {
      if (error instanceof PermanentSyncError) {
        // The server will never accept this (e.g. a duplicate list name); don't block everything behind it.
        dropped++;
        local.dequeue(queued.id);
        continue;
      }
      return { status: 'offline', sent, dropped, pending: local.queue().length, error };
    }
  }

  let snapshot;
  try {
    snapshot = await remote.fetchSnapshot();
  } catch (error) {
    return { status: 'offline', sent, dropped, pending: local.queue().length, error };
  }
  local.replaceState(
    localFromSnapshot(
      snapshot,
      local.queue().map((q) => q.op),
      local.getState(),
    ),
  );
  local.setSyncedUserId(userId);
  return { status: 'synced', sent, dropped };
}
