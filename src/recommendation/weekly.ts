/**
 * "Your weekly 10": the best matches for this shopper right now, with variety.
 * Pure: no React, no I/O.
 */
import type { Product } from '../domain/types';
import type { PriceBands } from './engine';
import type { TasteModel } from './model';
import { scoreCandidates } from './rank';

export const WEEKLY_COUNT = 10;

/**
 * Highest expected-taste pieces (no exploration), skipping anything the model is
 * confident they'd dislike, with at most 2 per product type and 2 per brand so the
 * set feels curated rather than ten near-identical sofas.
 */
export function pickWeekly(
  candidates: readonly Product[],
  model: TasteModel,
  bands: PriceBands,
  seed: number,
  count = WEEKLY_COUNT,
): Product[] {
  const scored = scoreCandidates(candidates, model, { bands, seed })
    .filter((s) => !s.avoid)
    .sort((a, b) => b.mean - a.mean || (a.product.id < b.product.id ? -1 : 1));
  const perType = new Map<string, number>();
  const perBrand = new Map<string, number>();
  const out: Product[] = [];
  for (const { product } of scored) {
    const t = perType.get(product.subcategoryId) ?? 0;
    const b = perBrand.get(product.brand) ?? 0;
    if (t >= 2 || b >= 2) continue;
    perType.set(product.subcategoryId, t + 1);
    perBrand.set(product.brand, b + 1);
    out.push(product);
    if (out.length >= count) break;
  }
  return out;
}
