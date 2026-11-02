import { buildTasteProfile } from '@/recommendation';
import { addToList, createList } from '@/domain/wishlists';
import type { Product, SwipeDirection } from '@/domain/types';
import { generateCatalog } from '@/data/sample/catalog';
import { runSync, type SyncLocal } from '../engine';
import { applyOpToLocal, EMPTY_LOCAL } from '../local';
import type { LocalState, QueuedOp, SyncOp } from '../types';
import { FakeAccount, FakeRemote } from '../testing/fakeRemote';

const catalog = generateCatalog();
const byId = new Map(catalog.map((p) => [p.id, p]));
let clock = 1_000;
let seq = 0;

/** A simulated phone: local state + outbox, changing state the way the app's stores do. */
class Phone implements SyncLocal {
  state: LocalState = structuredClone(EMPTY_LOCAL);
  outbox: QueuedOp[] = [];
  syncedFor: string | null = null;
  signedInAs: string | null = null;

  getState = () => this.state;
  replaceState = (s: LocalState) => {
    this.state = s;
  };
  queue = () => [...this.outbox];
  enqueue = (ops: SyncOp[]) => {
    for (const op of ops) this.outbox.push({ id: `q${seq++}`, op, queuedAt: clock });
  };
  dequeue = (id: string) => {
    this.outbox = this.outbox.filter((q) => q.id !== id);
  };
  syncedUserId = () => this.syncedFor;
  setSyncedUserId = (id: string) => {
    this.syncedFor = id;
  };

  /** Change local state now; queue it for the account only when signed in (like the app). */
  private act(op: SyncOp) {
    this.state = applyOpToLocal(this.state, op);
    if (this.signedInAs) this.enqueue([op]);
  }
  swipe(product: Product, direction: SwipeDirection) {
    const swipe = {
      id: `s${seq++}`,
      productId: product.id,
      categoryId: product.categoryId,
      direction,
      swipedAt: clock++,
    };
    this.act({ type: 'swipe.add', swipe });
    if (direction === 'keep') this.act({ type: 'saved.add', item: { productId: product.id, savedAt: swipe.swipedAt } });
    return swipe;
  }
  undo(swipeId: string, productId: string) {
    this.act({ type: 'swipe.remove', swipeId });
    this.act({ type: 'saved.remove', productId });
  }
  newList(name: string) {
    const r = createList(this.state.lists, name, `l${seq++}`, clock++);
    if (!r.ok) throw new Error(r.error);
    const list = r.lists.find((l) => l.id === r.id)!;
    this.act({ type: 'list.upsert', list: { id: list.id, name: list.name, createdAt: list.createdAt } });
    return list.id;
  }
  addToList(listId: string, productId: string) {
    const lists = addToList(this.state.lists, listId, [productId], clock++);
    const item = lists.find((l) => l.id === listId)!.items[0];
    this.act({ type: 'listItems.add', listId, items: [item] });
  }
  setPicks(stylePicks: string[]) {
    this.act({ type: 'profile.set', profile: { stylePicks, onboarded: true } });
  }
  keptIds() {
    return this.state.saved.map((s) => s.productId).sort();
  }
  taste() {
    return buildTasteProfile(this.state.swipes, byId, {}, undefined, this.state.profile.stylePicks).weights;
  }
}

const p = (i: number) => catalog[i];

describe('sync between two phones and an account', () => {
  it('merges what you did before signing in, then shows it on a second phone', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();

    // Guest use on phone A.
    a.setPicks(['minimal', 'coastal', 'vintage']);
    a.swipe(p(0), 'keep');
    a.swipe(p(1), 'skip');
    a.swipe(p(2), 'keep');
    const living = a.newList('Living room');
    a.addToList(living, p(0).id);

    // First sign-in on A uploads all of it.
    a.signedInAs = 'u1';
    expect((await runSync('u1', a, remote)).status).toBe('synced');
    expect(account.snapshot.swipes).toHaveLength(3);
    expect(account.snapshot.saved.map((s) => s.productId).sort()).toEqual([p(0).id, p(2).id].sort());

    // Phone B signs in fresh and gets everything.
    const b = new Phone();
    b.signedInAs = 'u1';
    await runSync('u1', b, remote);
    expect(b.keptIds()).toEqual(a.keptIds());
    expect(b.state.lists.map((l) => l.name)).toEqual(['Living room']);
    expect(b.state.lists[0].items.map((i) => i.productId)).toEqual([p(0).id]);
    expect(b.state.profile.stylePicks).toEqual(['minimal', 'coastal', 'vintage']);
    expect(b.taste()).toEqual(a.taste());
  });

  it('keeps changes made offline and sends them when back online', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();
    a.signedInAs = 'u1';
    await runSync('u1', a, remote);

    remote.online = false;
    a.swipe(p(3), 'keep');
    a.swipe(p(4), 'keep');
    const offline = await runSync('u1', a, remote);
    expect(offline.status).toBe('offline');
    expect(a.keptIds()).toEqual([p(3).id, p(4).id].sort()); // still visible on the phone
    expect(a.outbox).toHaveLength(4);
    expect(account.snapshot.saved).toHaveLength(0);

    remote.online = true;
    expect((await runSync('u1', a, remote)).status).toBe('synced');
    expect(a.outbox).toHaveLength(0);
    expect(account.snapshot.saved.map((s) => s.productId).sort()).toEqual([p(3).id, p(4).id].sort());
  });

  it('sends a change made on one phone to the other, including undo', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();
    const b = new Phone();
    a.signedInAs = 'u1';
    b.signedInAs = 'u1';
    await runSync('u1', a, remote);
    await runSync('u1', b, remote);

    const s = a.swipe(p(5), 'keep');
    a.swipe(p(6), 'keep');
    await runSync('u1', a, remote);
    await runSync('u1', b, remote);
    expect(b.keptIds()).toEqual([p(5).id, p(6).id].sort());

    a.undo(s.id, p(5).id);
    await runSync('u1', a, remote);
    await runSync('u1', b, remote);
    expect(b.keptIds()).toEqual([p(6).id]);
    expect(b.state.swipes.map((x) => x.productId)).toEqual([p(6).id]);
    expect(b.taste()).toEqual(a.taste());
  });

  it('does not upload the same history twice if the first sync is cut off', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();
    a.swipe(p(7), 'keep');
    a.signedInAs = 'u1';
    remote.online = false;
    await runSync('u1', a, remote);
    const queued = a.outbox.length;
    await runSync('u1', a, remote);
    expect(a.outbox).toHaveLength(queued);
    remote.online = true;
    await runSync('u1', a, remote);
    expect(account.snapshot.swipes).toHaveLength(1);
  });

  it('skips a change the account rejects instead of getting stuck', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();
    const b = new Phone();
    a.signedInAs = 'u1';
    b.signedInAs = 'u1';
    await runSync('u1', a, remote);
    await runSync('u1', b, remote);
    a.newList('Gifts');
    b.newList('gifts'); // same name made on the other phone before syncing
    b.swipe(p(8), 'keep');
    await runSync('u1', a, remote);
    const r = await runSync('u1', b, remote);
    expect(r).toMatchObject({ status: 'synced', dropped: 1 });
    expect(b.state.lists.map((l) => l.name)).toEqual(['Gifts']);
    expect(b.keptIds()).toEqual([p(8).id]);
  });

  it('keeps a change made while a sync was downloading', async () => {
    const account = new FakeAccount();
    const remote = new FakeRemote(account);
    const a = new Phone();
    a.signedInAs = 'u1';
    const realFetch = remote.fetchSnapshot.bind(remote);
    remote.fetchSnapshot = async () => {
      const snap = await realFetch();
      a.swipe(p(9), 'keep'); // the user swipes mid-sync
      return snap;
    };
    await runSync('u1', a, remote);
    expect(a.keptIds()).toEqual([p(9).id]);
    expect(a.outbox.length).toBeGreaterThan(0);
  });
});
