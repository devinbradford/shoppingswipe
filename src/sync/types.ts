/**
 * Sync model. The phone is always the first to change (so the app feels
 * instant and works offline); every change is also recorded as a SyncOp in an
 * outbox and replayed to the account when online.
 */
import type { SavedItem, SwipeEvent, Wishlist, WishlistItem } from '@/domain/types';

export interface ProfileState {
  stylePicks: string[];
  onboarded: boolean;
}

/** Everything a signed-in user owns that is synced. */
export interface LocalState {
  swipes: SwipeEvent[];
  saved: SavedItem[];
  lists: Wishlist[];
  profile: ProfileState;
}

export type SyncOp =
  | { type: 'swipe.add'; swipe: SwipeEvent }
  | { type: 'swipe.remove'; swipeId: string }
  | { type: 'saved.add'; item: SavedItem }
  | { type: 'saved.remove'; productId: string }
  | { type: 'list.upsert'; list: { id: string; name: string; createdAt: number } }
  | { type: 'list.remove'; listId: string }
  | { type: 'listItems.add'; listId: string; items: WishlistItem[] }
  | { type: 'listItems.remove'; listId: string; productIds: string[] }
  | { type: 'profile.set'; profile: ProfileState };

export interface QueuedOp {
  id: string;
  op: SyncOp;
  queuedAt: number;
}

/** What the account holds, as fetched from the server. */
export interface RemoteSnapshot {
  swipes: SwipeEvent[];
  saved: SavedItem[];
  lists: Wishlist[];
  profile: ProfileState | null;
}

/** The server side of sync. Every `apply` must be safe to repeat. */
export interface SyncRemote {
  apply(op: SyncOp): Promise<void>;
  fetchSnapshot(): Promise<RemoteSnapshot>;
}

/** A failure that will not succeed on retry (e.g. a rule the server rejects). */
export class PermanentSyncError extends Error {}
