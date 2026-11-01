/**
 * Search filters: what the user narrowed results to. Pure, shared by the local
 * repository now and mirrored by SQL `where` clauses in Phase 3.
 */
import type { CategoryId, Product } from './types';

export interface SearchFilters {
  categoryIds: CategoryId[];
  retailerIds: string[];
  /** Inclusive, in cents. Null means no limit. */
  minPriceCents: number | null;
  maxPriceCents: number | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  categoryIds: [],
  retailerIds: [],
  minPriceCents: null,
  maxPriceCents: null,
};

export interface PricePreset {
  label: string;
  min: number | null;
  max: number | null;
}

/** Quick price ranges, in cents. */
export const PRICE_PRESETS: PricePreset[] = [
  { label: 'Under $50', min: null, max: 4999 },
  { label: '$50–$200', min: 5000, max: 20000 },
  { label: '$200–$500', min: 20000, max: 50000 },
  { label: '$500+', min: 50000, max: null },
];

export function matchesFilters(product: Product, f: SearchFilters): boolean {
  if (f.categoryIds.length > 0 && !f.categoryIds.includes(product.categoryId)) return false;
  if (f.retailerIds.length > 0 && !f.retailerIds.includes(product.retailerId)) return false;
  if (f.minPriceCents !== null && product.priceCents < f.minPriceCents) return false;
  if (f.maxPriceCents !== null && product.priceCents > f.maxPriceCents) return false;
  return true;
}

/** How many filter groups are switched on (for the "Filters 2" badge). */
export function countActiveFilters(f: SearchFilters): number {
  return (
    (f.categoryIds.length > 0 ? 1 : 0) +
    (f.retailerIds.length > 0 ? 1 : 0) +
    (f.minPriceCents !== null || f.maxPriceCents !== null ? 1 : 0)
  );
}

/** Swap min and max if entered the wrong way round; drop negatives. */
export function normalizePrice(f: SearchFilters): SearchFilters {
  let { minPriceCents: min, maxPriceCents: max } = f;
  if (min !== null && min < 0) min = null;
  if (max !== null && max < 0) max = null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { ...f, minPriceCents: min, maxPriceCents: max };
}

/** "$50" → 5000 cents. Empty or invalid → null. */
export function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function toggleIn<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((i) => i !== item) : [...items, item];
}
