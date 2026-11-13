/**
 * Saved products the catalog no longer returns (audit P1-2).
 *
 * When a store stops listing a product, the nightly import switches it off and the database
 * stops returning it. The shopper's saved id is still on the phone, so instead of the product
 * silently disappearing, Kept and lists show it in an "Unavailable on CureAvo" section, drawn
 * from a small copy (snapshot) of what the app last saw. Pure rules, unit-tested.
 *
 * Price honesty:
 * - `priceAtSave` is recorded only at the moment of a save on this phone, tied to that save's
 *   `savedAt`, and never overwritten for that save. "when you kept it" is shown only when it
 *   matches the saved item being shown.
 * - `lastKnownPrice` is updated whenever the catalog returns the product; shown as "Last seen at".
 * - No purchase link is ever stored, so an unavailable product can't be bought from a snapshot.
 */
import type { Product } from './types';

export interface Price {
  cents: number;
  currency: string;
}

export interface ProductSnapshot {
  id: string;
  title: string;
  brand: string;
  retailerId: string;
  /** Store name as last seen (the retailer list normally has it; this is the fallback). */
  retailerName?: string;
  categoryId: string;
  subcategoryId: string;
  /** First photo as last seen. It may stop loading once the store removes the product. */
  imageUrl?: string;
  /** The price when this phone saved it, and which save (`savedAt`) it belongs to. */
  priceAtSave?: Price & { savedAt: number };
  /** The price the last time the catalog returned the product. */
  lastKnownPrice?: Price & { at: number };
  /** When the catalog last returned the product (it was available then). */
  lastConfirmedAt?: number;
  /** When a clean-up pass first found nothing pointing at this snapshot. */
  orphanedAt?: number;
}

export type SnapshotMap = Readonly<Record<string, ProductSnapshot>>;

/** How long an unreferenced snapshot is kept before it's deleted (covers Undo, slow syncs, restarts). */
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** A refresh that changes nothing but the confirmation time is written at most this often. */
export const CONFIRM_EVERY_MS = 60 * 60 * 1000;

/** The snapshot after seeing `product` in the catalog at `now` (display fields + last-known price). */
export function seen(prev: ProductSnapshot | undefined, product: Product, now: number, retailerName?: string): ProductSnapshot {
  const { orphanedAt: _dropped, ...rest } = prev ?? ({} as Partial<ProductSnapshot>);
  void _dropped;
  return {
    ...rest,
    id: product.id,
    title: product.title,
    brand: product.brand,
    retailerId: product.retailerId,
    retailerName: retailerName ?? prev?.retailerName,
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    imageUrl: product.imageUrls[0] ?? prev?.imageUrl,
    lastKnownPrice: { cents: product.priceCents, currency: product.currency, at: now },
    lastConfirmedAt: now,
  };
}

/**
 * The snapshot for a save happening now. The save price is set once per save (`savedAt`):
 * a snapshot that already has one for this same save keeps it.
 */
export function savedNow(
  prev: ProductSnapshot | undefined,
  product: Product,
  savedAt: number,
  now: number,
  retailerName?: string,
): ProductSnapshot {
  const next = seen(prev, product, now, retailerName);
  if (prev?.priceAtSave?.savedAt === savedAt) return { ...next, priceAtSave: prev.priceAtSave };
  return { ...next, priceAtSave: { cents: product.priceCents, currency: product.currency, savedAt } };
}

/** Whether a catalog refresh would change anything worth writing to storage. */
export function refreshChanges(prev: ProductSnapshot | undefined, product: Product, now: number): boolean {
  if (!prev) return true;
  const last = prev.lastKnownPrice;
  return (
    prev.orphanedAt !== undefined ||
    prev.title !== product.title ||
    prev.brand !== product.brand ||
    prev.retailerId !== product.retailerId ||
    prev.imageUrl !== (product.imageUrls[0] ?? prev.imageUrl) ||
    last?.cents !== product.priceCents ||
    last?.currency !== product.currency ||
    (prev.lastConfirmedAt ?? 0) + CONFIRM_EVERY_MS <= now
  );
}

export interface UnavailableItem {
  productId: string;
  /** The saved item's time (Kept), so the save price can be matched to it. */
  savedAt?: number;
  /** What the app last saw, or null if it never kept a copy (older installs, another phone). */
  snapshot: ProductSnapshot | null;
}

/**
 * Splits saved ids into what the catalog returned (shown live, current price and link) and what
 * it didn't. Call it ONLY with the result of a lookup that succeeded: a failed request must show
 * the error state instead, never "unavailable". Keeps the saved order; ignores duplicate ids.
 */
export function splitAvailability(
  items: readonly { productId: string; savedAt?: number }[],
  fetched: readonly Product[],
  snapshots: SnapshotMap,
): { available: Product[]; unavailable: UnavailableItem[] } {
  const byId = new Map(fetched.map((p) => [p.id, p]));
  const seenIds = new Set<string>();
  const available: Product[] = [];
  const unavailable: UnavailableItem[] = [];
  for (const item of items) {
    if (seenIds.has(item.productId)) continue;
    seenIds.add(item.productId);
    const product = byId.get(item.productId);
    if (product) available.push(product);
    else unavailable.push({ productId: item.productId, savedAt: item.savedAt, snapshot: snapshots[item.productId] ?? null });
  }
  return { available, unavailable };
}

/**
 * The honest price line for an unavailable item, or null when there's nothing honest to say.
 * "when you kept it" only for the save price of this very save; otherwise "Last seen at".
 */
export function unavailablePrice(
  item: UnavailableItem,
  formatPrice: (cents: number, currency: string) => string,
): string | null {
  const s = item.snapshot;
  if (!s) return null;
  if (item.savedAt !== undefined && s.priceAtSave && s.priceAtSave.savedAt === item.savedAt) {
    return `${formatPrice(s.priceAtSave.cents, s.priceAtSave.currency)} when you kept it`;
  }
  const last = s.lastKnownPrice ?? (s.priceAtSave ? { ...s.priceAtSave, at: s.priceAtSave.savedAt } : undefined);
  return last ? `Last seen at ${formatPrice(last.cents, last.currency)}` : null;
}

/**
 * The line under "Kept": the total covers only pieces that can be bought; unavailable ones
 * are counted separately so the numbers match what's on screen.
 */
export function collectionSummary(
  available: { count: number; total: string | null },
  unavailableCount: number,
): string {
  const parts: string[] = [];
  if (unavailableCount === 0) {
    // Exactly as before this change: "6 pieces · $1,505.94".
    parts.push(`${available.count} ${available.count === 1 ? 'piece' : 'pieces'}`);
  } else if (available.count > 0) {
    parts.push(`${available.count} available`);
  }
  if (available.count > 0 && available.total) parts.push(available.total);
  if (unavailableCount > 0) parts.push(`${unavailableCount} unavailable`);
  return parts.join(' · ');
}

/**
 * One clean-up pass. Snapshots something still points at (Kept, a list, a purchase) stay and
 * lose any orphan mark. Others are marked the first time and deleted only once they've been
 * unreferenced for `grace`, so Undo, a slow sync or a restart can never lose one early.
 * Returns null when nothing changed.
 */
export function sweepSnapshots(
  snapshots: SnapshotMap,
  referenced: ReadonlySet<string>,
  now: number,
  grace = ORPHAN_GRACE_MS,
): Record<string, ProductSnapshot> | null {
  let changed = false;
  const next: Record<string, ProductSnapshot> = {};
  for (const [id, s] of Object.entries(snapshots)) {
    if (referenced.has(id)) {
      if (s.orphanedAt !== undefined) {
        const { orphanedAt: _o, ...kept } = s;
        void _o;
        next[id] = kept;
        changed = true;
      } else next[id] = s;
    } else if (s.orphanedAt === undefined) {
      next[id] = { ...s, orphanedAt: now };
      changed = true;
    } else if (now - s.orphanedAt < grace) {
      next[id] = s;
    } else {
      changed = true; // deleted
    }
  }
  return changed ? next : null;
}
