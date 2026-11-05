/**
 * Product page helpers: "Why it's for you" and "More like this".
 * Pure: no React, no I/O.
 */
import type { Product } from '../domain/types';
import { reasonLabels, type PriceBands } from './engine';
import { priceRatio, type TasteModel } from './model';
import { scoreCandidates } from './rank';

export interface WhyForYou {
  /** Up to two things they like about it, e.g. ["mid-century", "walnut"]. */
  labels: string[];
  /** True/false once we know their budget well enough; null when we don't. */
  withinBudget: boolean | null;
}

/** How confident the budget must be before we mention it. */
const BUDGET_CONFIDENCE = 0.3;

export function whyForYou(product: Product, model: TasteModel, bands: PriceBands): WhyForYou {
  const [scored] = scoreCandidates([product], model, { bands, seed: 1 });
  const budget = model.budget;
  return {
    labels: scored ? reasonLabels(scored.reasons) : [],
    withinBudget:
      budget && budget.confidence >= BUDGET_CONFIDENCE ? priceRatio(product, bands) <= budget.ceiling : null,
  };
}

/** "Mid-century and walnut, within your budget", or null when there's nothing honest to say. */
export function formatWhy(why: WhyForYou): string | null {
  const likes = why.labels.length ? why.labels.join(' and ') : null;
  const fits = why.withinBudget ? 'within your budget' : null;
  if (!likes && !fits) return null;
  const text = [likes, fits].filter(Boolean).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lookKeys(p: Product): string[] {
  return [...p.styleTags.map((s) => `s:${s}`), `m:${p.material}`, `c:${p.color}`];
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const shared = a.filter((k) => b.includes(k)).length;
  const union = a.length + b.length - shared;
  return union === 0 ? 0 : shared / union;
}

export interface SimilarOptions {
  /** How many to return. */
  count?: number;
  /** Products to leave out (e.g. ones they skipped). */
  excludeIds?: ReadonlySet<string>;
}

/**
 * Pieces like this one, ordered for this shopper: mostly look-alikes (style, material,
 * color, same type, similar price), nudged by their taste. Never more than two from one brand.
 */
export function similarProducts(
  target: Product,
  candidates: readonly Product[],
  model: TasteModel,
  bands: PriceBands,
  { count = 8, excludeIds }: SimilarOptions = {},
): Product[] {
  const pool = candidates.filter((p) => p.id !== target.id && !excludeIds?.has(p.id));
  if (pool.length === 0) return [];
  const taste = new Map(scoreCandidates(pool, model, { bands, seed: 1 }).map((s) => [s.product.id, s.mean]));
  const look = lookKeys(target);
  const targetPrice = priceRatio(target, bands);

  const scored = pool.map((p) => {
    const alike = jaccard(look, lookKeys(p));
    const sameType = p.subcategoryId === target.subcategoryId ? 1 : 0;
    const priceGap = Math.abs(priceRatio(p, bands) - targetPrice);
    const score = 2 * alike + 0.8 * sameType - 0.5 * priceGap + 0.3 * Math.tanh(taste.get(p.id) ?? 0);
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.p.id < b.p.id ? -1 : 1));

  const perBrand = new Map<string, number>();
  const out: Product[] = [];
  for (const { p } of scored) {
    const n = perBrand.get(p.brand) ?? 0;
    if (n >= 2) continue;
    perBrand.set(p.brand, n + 1);
    out.push(p);
    if (out.length >= count) break;
  }
  return out;
}
