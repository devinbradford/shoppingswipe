/** Pure helpers that turn ops and snapshots into local state. No I/O. */
import { addToList, deleteList, removeFromList } from '@/domain/wishlists';
import type { LocalState, RemoteSnapshot, SyncOp } from './types';

export const EMPTY_LOCAL: LocalState = {
  swipes: [],
  saved: [],
  lists: [],
  profile: { stylePicks: [], onboarded: false },
};

/** Apply one change to local state (used to replay still-pending changes over a fresh snapshot). */
export function applyOpToLocal(state: LocalState, op: SyncOp): LocalState {
  switch (op.type) {
    case 'swipe.add':
      return state.swipes.some((s) => s.id === op.swipe.id) ? state : { ...state, swipes: [...state.swipes, op.swipe] };
    case 'swipe.remove':
      return { ...state, swipes: state.swipes.filter((s) => s.id !== op.swipeId) };
    case 'saved.add':
      return state.saved.some((s) => s.productId === op.item.productId)
        ? state
        : { ...state, saved: [op.item, ...state.saved] };
    case 'saved.remove':
      return { ...state, saved: state.saved.filter((s) => s.productId !== op.productId) };
    case 'list.upsert': {
      const exists = state.lists.some((l) => l.id === op.list.id);
      return {
        ...state,
        lists: exists
          ? state.lists.map((l) => (l.id === op.list.id ? { ...l, name: op.list.name } : l))
          : [{ ...op.list, items: [] }, ...state.lists],
      };
    }
    case 'list.remove':
      return { ...state, lists: deleteList(state.lists, op.listId) };
    case 'listItems.add': {
      // Keep each item's own time; addToList stamps one time for all, so add in order.
      let lists = state.lists;
      for (const item of [...op.items].reverse()) lists = addToList(lists, op.listId, [item.productId], item.addedAt);
      return { ...state, lists };
    }
    case 'listItems.remove':
      return { ...state, lists: removeFromList(state.lists, op.listId, op.productIds) };
    case 'profile.set':
      return { ...state, profile: op.profile };
  }
}

/** The account's state, with any changes this phone hasn't sent yet laid on top. */
export function localFromSnapshot(snapshot: RemoteSnapshot, pending: readonly SyncOp[], local: LocalState): LocalState {
  let state: LocalState = {
    swipes: [...snapshot.swipes].sort((a, b) => a.swipedAt - b.swipedAt),
    saved: [...snapshot.saved].sort((a, b) => b.savedAt - a.savedAt),
    lists: [...snapshot.lists].sort((a, b) => b.createdAt - a.createdAt),
    // No profile on the account yet: keep what the phone has.
    profile: snapshot.profile ?? local.profile,
  };
  for (const op of pending) state = applyOpToLocal(state, op);
  return state;
}

/**
 * Everything on this phone, as changes to send. Used the first time someone
 * signs in here, so what they did before having an account is merged in.
 */
export function snapshotToOps(local: LocalState): SyncOp[] {
  const ops: SyncOp[] = [];
  for (const swipe of [...local.swipes].sort((a, b) => a.swipedAt - b.swipedAt)) ops.push({ type: 'swipe.add', swipe });
  for (const item of local.saved) ops.push({ type: 'saved.add', item });
  for (const list of local.lists) {
    ops.push({ type: 'list.upsert', list: { id: list.id, name: list.name, createdAt: list.createdAt } });
    if (list.items.length) ops.push({ type: 'listItems.add', listId: list.id, items: list.items });
  }
  if (local.profile.onboarded || local.profile.stylePicks.length)
    ops.push({ type: 'profile.set', profile: local.profile });
  return ops;
}
