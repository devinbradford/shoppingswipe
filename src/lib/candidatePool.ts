/**
 * How the deck picks which products the recommender gets to rank (P1-1).
 *
 * The phone never downloads the whole catalog for a deck. It reads a light index of every
 * active product (already loaded for price bands), works out which are eligible (room,
 * type, store, price, not swiped), then picks a bounded, seeded sample of those and loads
 * only them. A different seed each time the deck opens means every eligible product gets
 * its turn; when the deck runs low it asks for more, so it only says "seen everything"
 * once nothing eligible is left. Pure, so it's unit-tested.
 */
import type { SearchFilters } from '@/domain/filters';
import type { CategoryId, SubcategoryId } from '@/domain/types';
import { hashSeed } from '@/recommendation/random';

/** Most products handed to the recommender at once (what it ranked before this fix, so ranking cost is unchanged). */
export const CANDIDATE_POOL_SIZE = 1000;
/** Ids per "fetch these products" request: keeps each URL around 4 KB, well under server limits. */
export const ID_CHUNK = 150;
/** Rows per page when paging through the catalog (Supabase's default per-request cap). */
export const PAGE_SIZE = 1000;
/** Ask for more candidates when this few cards are left (well before the deck runs dry). */
export const REFILL_AT = 30;

/** The fields of a catalog index entry the eligibility check needs. */
export interface CatalogEntry {
  id: string;
  categoryId: string;
  subcategoryId: string;
  retailerId: string;
  priceCents: number;
}

export interface EligibilityQuery {
  categoryId?: CategoryId;
  subcategoryId?: SubcategoryId;
  filters?: SearchFilters;
  excludeIds?: ReadonlySet<string>;
}

export function isEligible(e: CatalogEntry, q: EligibilityQuery): boolean {
  if (q.categoryId && e.categoryId !== q.categoryId) return false;
  if (q.subcategoryId && e.subcategoryId !== q.subcategoryId) return false;
  if (q.excludeIds?.has(e.id)) return false;
  const f = q.filters;
  if (f) {
    if (f.categoryIds.length > 0 && !f.categoryIds.includes(e.categoryId as CategoryId)) return false;
    if (f.subcategoryIds.length > 0 && !f.subcategoryIds.includes(e.subcategoryId as SubcategoryId)) return false;
    if (f.retailerIds.length > 0 && !f.retailerIds.includes(e.retailerId)) return false;
    if (f.minPriceCents !== null && e.priceCents < f.minPriceCents) return false;
    if (f.maxPriceCents !== null && e.priceCents > f.maxPriceCents) return false;
  }
  return true;
}

/**
 * Spreads FNV hashes evenly (MurmurHash3's finaliser). FNV alone clusters badly for ids that
 * differ only in their last characters (one tenth of a 10k catalog got 36 picks, another 191).
 */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Up to `size` of `ids`, chosen evenly across the whole list (not the first ones by id).
 * The same ids and seed always give the same pick; returned in id order, no duplicates.
 */
export function sampleIds(ids: readonly string[], size: number, seed: number): string[] {
  const unique = [...new Set(ids)];
  if (unique.length <= size) return unique.sort();
  if (size <= 0) return [];
  // Hash each id, find the size-th smallest hash (a numeric sort, no string sorting of the
  // whole catalog), keep everything below it and break ties at the threshold by id.
  const hashes = new Uint32Array(unique.length);
  for (let i = 0; i < unique.length; i++) hashes[i] = mix(hashSeed(`${seed}:${unique[i]}`));
  const threshold = hashes.slice().sort()[size - 1]!;
  const below: string[] = [];
  const at: string[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (hashes[i]! < threshold) below.push(unique[i]!);
    else if (hashes[i] === threshold) at.push(unique[i]!);
  }
  return [...below, ...at.sort().slice(0, size - below.length)].sort();
}

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export type RefillState = 'idle' | 'loading' | 'failed';

/** Whether the deck should ask for more candidates now. */
export function shouldRefill(s: { ready: boolean; more: boolean; refill: RefillState; cardsLeft: number }): boolean {
  return s.ready && s.more && s.refill === 'idle' && s.cardsLeft <= REFILL_AT;
}

/**
 * What the deck screen should show. An empty deck only counts as "seen everything" when no
 * eligible products remain; while more are on their way it's still loading, and if fetching
 * them failed it's an error with Try again, never a false "you've seen it all".
 */
export function deckStatusFor<S extends 'loading' | 'ready' | 'error'>(s: {
  status: S;
  cardsLeft: number;
  more: boolean;
  refill: RefillState;
}): S | 'loading' | 'error' {
  if (s.status !== 'ready' || s.cardsLeft > 0 || !s.more) return s.status;
  return s.refill === 'failed' ? 'error' : 'loading';
}
