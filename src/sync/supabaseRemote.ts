/** The real account: applies sync changes to Supabase tables and reads them back. */
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  profileFromRow,
  profileToRow,
  savedFromRow,
  savedToRow,
  swipeFromRow,
  swipeToRow,
  wishlistFromRow,
  wishlistItemToRow,
  wishlistToRow,
  type SwipeRow,
  type WishlistRow,
} from '@/lib/rows';
import { PermanentSyncError, type RemoteSnapshot, type SyncOp, type SyncRemote } from './types';

interface DbError {
  code?: string;
  message: string;
}

/**
 * Database rule violations (bad data, duplicates, permission) won't succeed on
 * retry; anything else (no network, timeouts, server hiccups) will.
 */
export function isPermanent(error: DbError): boolean {
  return /^(22|23|42)[0-9A-Z]{3}$/.test(error.code ?? '');
}

function check(error: DbError | null) {
  if (!error) return;
  if (isPermanent(error)) throw new PermanentSyncError(`${error.code}: ${error.message}`);
  throw new Error(error.message);
}

const PAGE = 1000;

export class SupabaseSyncRemote implements SyncRemote {
  constructor(private readonly db: SupabaseClient) {}

  async apply(op: SyncOp): Promise<void> {
    const db = this.db;
    switch (op.type) {
      case 'swipe.add':
        return check(
          (
            await db
              .from('swipes')
              .upsert(swipeToRow(op.swipe), { onConflict: 'user_id,client_id', ignoreDuplicates: true })
          ).error,
        );
      case 'swipe.remove':
        return check((await db.from('swipes').delete().eq('client_id', op.swipeId)).error);
      case 'saved.add':
        return check(
          (
            await db
              .from('saved_items')
              .upsert(savedToRow(op.item), { onConflict: 'user_id,product_id', ignoreDuplicates: true })
          ).error,
        );
      case 'saved.remove':
        return check((await db.from('saved_items').delete().eq('product_id', op.productId)).error);
      case 'list.upsert':
        return check((await db.from('wishlists').upsert(wishlistToRow(op.list), { onConflict: 'id' })).error);
      case 'list.remove':
        return check((await db.from('wishlists').delete().eq('id', op.listId)).error);
      case 'listItems.add': {
        const { error } = await db.from('wishlist_items').upsert(
          op.items.map((i) => wishlistItemToRow(op.listId, i)),
          { onConflict: 'wishlist_id,product_id', ignoreDuplicates: true },
        );
        // The list was deleted on another device: nothing left to add to.
        if (error?.code === '23503') return;
        return check(error);
      }
      case 'listItems.remove':
        return check(
          (await db.from('wishlist_items').delete().eq('wishlist_id', op.listId).in('product_id', op.productIds)).error,
        );
      case 'profile.set':
        return check((await db.from('profiles').upsert(profileToRow(op.profile), { onConflict: 'user_id' })).error);
    }
  }

  async fetchSnapshot(): Promise<RemoteSnapshot> {
    const db = this.db;
    // Swipes can run into the thousands: read them a page at a time.
    const swipes: SwipeRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from('swipes')
        .select('client_id, product_id, category_id, direction, swiped_at')
        .order('swiped_at', { ascending: true })
        .range(from, from + PAGE - 1);
      check(error);
      swipes.push(...((data ?? []) as SwipeRow[]));
      if (!data || data.length < PAGE) break;
    }
    const [saved, lists, profile] = await Promise.all([
      db.from('saved_items').select('product_id, saved_at'),
      db.from('wishlists').select('id, name, created_at, wishlist_items(product_id, added_at)'),
      db.from('profiles').select('style_picks, onboarded').maybeSingle(),
    ]);
    check(saved.error);
    check(lists.error);
    check(profile.error);
    return {
      swipes: swipes.map(swipeFromRow),
      saved: (saved.data ?? []).map(savedFromRow),
      lists: ((lists.data ?? []) as WishlistRow[]).map(wishlistFromRow),
      profile: profile.data ? profileFromRow(profile.data) : null,
    };
  }
}
