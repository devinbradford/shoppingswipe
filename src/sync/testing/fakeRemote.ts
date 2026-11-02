/** In-memory stand-in for the account on the server, with the same rules as the real tables. */
import type { Wishlist } from '@/domain/types';
import { PermanentSyncError, type RemoteSnapshot, type SyncOp, type SyncRemote } from '../types';

export class FakeAccount {
  snapshot: RemoteSnapshot = { swipes: [], saved: [], lists: [], profile: null };
}

export class FakeRemote implements SyncRemote {
  online = true;
  constructor(private readonly account: FakeAccount) {}

  async apply(op: SyncOp): Promise<void> {
    if (!this.online) throw new Error('Network request failed');
    const a = this.account.snapshot;
    switch (op.type) {
      case 'swipe.add':
        if (!a.swipes.some((s) => s.id === op.swipe.id)) a.swipes.push(op.swipe);
        return;
      case 'swipe.remove':
        a.swipes = a.swipes.filter((s) => s.id !== op.swipeId);
        return;
      case 'saved.add':
        if (!a.saved.some((s) => s.productId === op.item.productId)) a.saved.push(op.item);
        return;
      case 'saved.remove':
        a.saved = a.saved.filter((s) => s.productId !== op.productId);
        return;
      case 'list.upsert': {
        const clash = a.lists.find((l) => l.id !== op.list.id && l.name.toLowerCase() === op.list.name.toLowerCase());
        if (clash) throw new PermanentSyncError('duplicate list name');
        const existing = a.lists.find((l) => l.id === op.list.id);
        if (existing) existing.name = op.list.name;
        else a.lists.push({ ...op.list, items: [] });
        return;
      }
      case 'list.remove':
        a.lists = a.lists.filter((l) => l.id !== op.listId);
        return;
      case 'listItems.add': {
        const list = a.lists.find((l) => l.id === op.listId);
        if (!list) return; // list deleted elsewhere: nothing to add to
        for (const item of op.items) if (!list.items.some((i) => i.productId === item.productId)) list.items.push(item);
        return;
      }
      case 'listItems.remove': {
        const list = a.lists.find((l) => l.id === op.listId);
        if (list) list.items = list.items.filter((i) => !op.productIds.includes(i.productId));
        return;
      }
      case 'profile.set':
        a.profile = op.profile;
        return;
    }
  }

  async fetchSnapshot(): Promise<RemoteSnapshot> {
    if (!this.online) throw new Error('Network request failed');
    const a = this.account.snapshot;
    const lists: Wishlist[] = a.lists.map((l) => ({
      ...l,
      items: [...l.items].sort((x, y) => y.addedAt - x.addedAt),
    }));
    return structuredClone({ ...a, lists });
  }
}
