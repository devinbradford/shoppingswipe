import { formatPrice } from '@/lib/format';
import { formatBoardTotal } from '../board';
import {
  collectionSummary,
  CONFIRM_EVERY_MS,
  ORPHAN_GRACE_MS,
  refreshChanges,
  savedNow,
  seen,
  splitAvailability,
  sweepSnapshots,
  unavailablePrice,
  type ProductSnapshot,
} from '../availability';
import type { Product } from '../types';

const product = (id: string, priceCents = 10000, over: Partial<Product> = {}): Product => ({
  id,
  categoryId: 'bedroom',
  subcategoryId: 'nightstands',
  retailerId: 'r1',
  title: `Piece ${id}`,
  brand: 'Example Brand',
  description: '',
  priceCents,
  currency: 'USD',
  imageUrls: [`https://img.example.com/${id}.jpg`],
  productUrl: `https://shop.example.com/${id}`,
  styleTags: [],
  material: '',
  color: '',
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});

describe('snapshots', () => {
  it('never store a purchase link', () => {
    const s = savedNow(undefined, product('a'), 100, 100, 'Example Store');
    expect(JSON.stringify(s)).not.toContain('shop.example.com');
    expect(s).toMatchObject({ title: 'Piece a', retailerName: 'Example Store', imageUrl: 'https://img.example.com/a.jpg' });
  });

  it('record the price at save once per save; later sightings only move the last-known price', () => {
    const atSave = savedNow(undefined, product('a', 10000), 100, 100);
    expect(atSave.priceAtSave).toEqual({ cents: 10000, currency: 'USD', savedAt: 100 });
    const later = seen(atSave, product('a', 12500), 5000);
    expect(later.priceAtSave).toEqual({ cents: 10000, currency: 'USD', savedAt: 100 });
    expect(later.lastKnownPrice).toEqual({ cents: 12500, currency: 'USD', at: 5000 });
    expect(later.lastConfirmedAt).toBe(5000);
    // Saving the same save again (e.g. a repeated call) keeps the original price.
    expect(savedNow(later, product('a', 9000), 100, 6000).priceAtSave?.cents).toBe(10000);
    // A new save (removed, then kept again later) records its own price.
    expect(savedNow(later, product('a', 9000), 7000, 7000).priceAtSave).toEqual({
      cents: 9000,
      currency: 'USD',
      savedAt: 7000,
    });
  });

  it('a sighting without a save never invents a save price', () => {
    expect(seen(undefined, product('a'), 100).priceAtSave).toBeUndefined();
  });

  it('keep the currency with each price', () => {
    const s = seen(savedNow(undefined, product('a', 5000, { currency: 'GBP' }), 1, 1), product('a', 6000), 2);
    expect(s.priceAtSave?.currency).toBe('GBP');
    expect(s.lastKnownPrice?.currency).toBe('USD');
  });

  it('only rewrite storage when something changed, or hourly to confirm', () => {
    const s = seen(undefined, product('a'), 1000);
    expect(refreshChanges(undefined, product('a'), 1000)).toBe(true);
    expect(refreshChanges(s, product('a'), 2000)).toBe(false);
    expect(refreshChanges(s, product('a', 9999), 2000)).toBe(true);
    expect(refreshChanges(s, product('a', 10000, { title: 'Renamed' }), 2000)).toBe(true);
    expect(refreshChanges(s, product('a'), 1000 + CONFIRM_EVERY_MS)).toBe(true);
    expect(refreshChanges({ ...s, orphanedAt: 5 }, product('a'), 2000)).toBe(true);
  });
});

describe('splitAvailability', () => {
  const items = [
    { productId: 'a', savedAt: 3 },
    { productId: 'b', savedAt: 2 },
    { productId: 'c', savedAt: 1 },
  ];
  const snaps = { b: savedNow(undefined, product('b', 4500), 2, 2) };

  it('active → inactive → active again', () => {
    const all = [product('a'), product('b', 5000), product('c')];
    expect(splitAvailability(items, all, snaps).unavailable).toEqual([]);
    const gone = splitAvailability(items, [product('a'), product('c')], snaps);
    expect(gone.available.map((p) => p.id)).toEqual(['a', 'c']);
    expect(gone.unavailable).toEqual([{ productId: 'b', savedAt: 2, snapshot: snaps.b }]);
    // Back again: the live record and today's price, not the snapshot.
    const back = splitAvailability(items, all, snaps);
    expect(back.available.find((p) => p.id === 'b')?.priceCents).toBe(5000);
    expect(back.unavailable).toEqual([]);
  });

  it('deleted products: with a snapshot, and without one (older installs, another phone)', () => {
    const r = splitAvailability(items, [product('a')], snaps);
    expect(r.unavailable.map((u) => [u.productId, u.snapshot?.title ?? null])).toEqual([
      ['b', 'Piece b'],
      ['c', null],
    ]);
  });

  it('keeps the saved order and ignores duplicate ids', () => {
    const r = splitAvailability([...items, { productId: 'a', savedAt: 0 }], [product('c'), product('a')], {});
    expect(r.available.map((p) => p.id)).toEqual(['a', 'c']);
    expect(r.unavailable.map((u) => u.productId)).toEqual(['b']);
  });
});

describe('unavailablePrice', () => {
  const kept = savedNow(undefined, product('a', 75999), 500, 500);
  it('"when you kept it" only for the price recorded at this very save', () => {
    expect(unavailablePrice({ productId: 'a', savedAt: 500, snapshot: kept }, formatPrice)).toBe('$759.99 when you kept it');
  });
  it('a different save (or a list) gets "Last seen at", never "when you kept it"', () => {
    const later = seen(kept, product('a', 69999), 900);
    expect(unavailablePrice({ productId: 'a', savedAt: 800, snapshot: later }, formatPrice)).toBe('Last seen at $699.99');
    expect(unavailablePrice({ productId: 'a', snapshot: later }, formatPrice)).toBe('Last seen at $699.99');
  });
  it('older items with no save price never get one invented', () => {
    const old = seen(undefined, product('a', 12000), 900);
    expect(unavailablePrice({ productId: 'a', savedAt: 100, snapshot: old }, formatPrice)).toBe('Last seen at $120');
    const noPrice: ProductSnapshot = { id: 'a', title: 't', brand: '', retailerId: 'r', categoryId: 'bedroom', subcategoryId: 'x' };
    expect(unavailablePrice({ productId: 'a', savedAt: 100, snapshot: noPrice }, formatPrice)).toBeNull();
    expect(unavailablePrice({ productId: 'a', savedAt: 100, snapshot: null }, formatPrice)).toBeNull();
  });
});

describe('collectionSummary', () => {
  it('reads exactly as before when nothing is unavailable', () => {
    for (const [count, cents] of [[0, 0], [1, 4999], [6, 150594]] as const) {
      expect(collectionSummary({ count, total: formatPrice(cents, 'USD') }, 0)).toBe(
        formatBoardTotal({ count, totalCents: cents, currency: 'USD' }, formatPrice),
      );
    }
  });
  it('keeps buyable totals apart from unavailable pieces', () => {
    expect(collectionSummary({ count: 6, total: '$1,505.94' }, 2)).toBe('6 available · $1,505.94 · 2 unavailable');
    expect(collectionSummary({ count: 0, total: null }, 2)).toBe('2 unavailable');
    expect(collectionSummary({ count: 3, total: null }, 1)).toBe('3 available · 1 unavailable');
  });
});

describe('sweepSnapshots', () => {
  const snaps = { a: seen(undefined, product('a'), 1), b: seen(undefined, product('b'), 1) };
  it('keeps referenced snapshots and only marks unreferenced ones at first', () => {
    const marked = sweepSnapshots(snaps, new Set(['a']), 1000)!;
    expect(Object.keys(marked)).toEqual(['a', 'b']);
    expect(marked.b!.orphanedAt).toBe(1000);
    expect(marked.a!.orphanedAt).toBeUndefined();
    // Still inside the grace period: nothing changes.
    expect(sweepSnapshots(marked, new Set(['a']), 1000 + ORPHAN_GRACE_MS - 1)).toBeNull();
    // Referenced again (Undo, a sync bringing it back): the mark goes.
    expect(sweepSnapshots(marked, new Set(['a', 'b']), 2000)!.b!.orphanedAt).toBeUndefined();
    // Unreferenced for the whole grace period: deleted.
    expect(Object.keys(sweepSnapshots(marked, new Set(['a']), 1000 + ORPHAN_GRACE_MS)!)).toEqual(['a']);
  });
  it('reports no change when there is nothing to do', () => {
    expect(sweepSnapshots(snaps, new Set(['a', 'b']), 5)).toBeNull();
  });
});
