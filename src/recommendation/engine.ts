/**
 * Content-based ranking engine.
 *
 * Pure TypeScript: no React, no I/O, relative imports only, so this folder can
 * be copied into a Supabase Edge Function (Deno) unchanged.
 *
 * How it works, in short:
 *  1. Every product is described by features: style tags, material, color,
 *     brand, retailer and a price band (low / mid / high within its category).
 *  2. The taste profile adds +1 for each feature of a kept product and -0.6
 *     for a skipped one, with older swipes counting less (recency decay).
 *     Taste is shared across categories: liking walnut furniture nudges
 *     walnut decor up too.
 *  3. Candidates are scored against the profile and sorted. 15% of slots are
 *     handed to a random lower-ranked item (exploration) so the feed doesn't
 *     get stuck in a bubble.
 *  4. Until the user has kept 3 things (cold start) we show a varied,
 *     shuffled mix instead.
 */
import type { Product, SubcategoryId, SwipeEvent } from '../domain/types';
import { createRng } from './random';

export type FeatureKind = 'style' | 'material' | 'color' | 'brand' | 'retailer' | 'price';
export type PriceBand = 'low' | 'mid' | 'high';

export interface Feature {
  kind: FeatureKind;
  /** Lower-cased value used for matching. */
  value: string;
  /** Original casing, for display. */
  label: string;
  /** `kind:value`, the key used in the taste profile. */
  key: string;
}

/** Per product type: [low/mid boundary, mid/high boundary] in cents. A $400 rug and a $400 sofa sit in different bands. */
export type PriceBands = Partial<Record<SubcategoryId, [number, number]>>;

export interface RecommenderOptions {
  explorationRate: number;
  coldStartKeeps: number;
  skipWeight: number;
  /** After this many newer swipes, a swipe counts half as much. */
  halfLifeSwipes: number;
  featureWeights: Record<FeatureKind, number>;
  /** Minimum contribution for a feature to be named as a reason. */
  reasonThreshold: number;
}

export const DEFAULT_OPTIONS: RecommenderOptions = {
  explorationRate: 0.15,
  coldStartKeeps: 3,
  skipWeight: 0.6,
  halfLifeSwipes: 40,
  featureWeights: {
    style: 1.0,
    brand: 0.7,
    material: 0.6,
    price: 0.6,
    color: 0.5,
    retailer: 0.25,
  },
  reasonThreshold: 0.12,
};

export interface TasteProfile {
  /** Feature key -> normalised affinity (positive = likes, negative = dislikes). */
  weights: Record<string, number>;
  keepCount: number;
  swipeCount: number;
  /** True when the user picked enough styles on first launch to skip the cold start. */
  seeded: boolean;
}

export interface RankedProduct {
  product: Product;
  score: number;
  /** Features that pushed this product up, strongest first. */
  reasons: Feature[];
  /** True when placed by exploration rather than by score. */
  explored: boolean;
}

export const EMPTY_PROFILE: TasteProfile = { weights: {}, keepCount: 0, swipeCount: 0, seeded: false };

function feature(kind: FeatureKind, value: string): Feature {
  const v = value.toLowerCase();
  return { kind, value: v, label: value, key: `${kind}:${v}` };
}

/** Low / mid / high price boundaries (terciles) for each product type. */
export function computePriceBands(products: readonly Product[]): PriceBands {
  const byType = new Map<SubcategoryId, number[]>();
  for (const p of products) {
    const list = byType.get(p.subcategoryId) ?? [];
    list.push(p.priceCents);
    byType.set(p.subcategoryId, list);
  }
  const bands: PriceBands = {};
  for (const [typeId, prices] of byType) {
    prices.sort((a, b) => a - b);
    const at = (q: number) => prices[Math.min(prices.length - 1, Math.floor(q * prices.length))];
    bands[typeId] = [at(1 / 3), at(2 / 3)];
  }
  return bands;
}

export function priceBandOf(product: Product, bands: PriceBands): PriceBand {
  const b = bands[product.subcategoryId];
  if (!b) return 'mid';
  if (product.priceCents < b[0]) return 'low';
  if (product.priceCents < b[1]) return 'mid';
  return 'high';
}

export function productFeatures(product: Product, bands: PriceBands): Feature[] {
  return [
    ...product.styleTags.map((s) => feature('style', s)),
    feature('material', product.material),
    feature('color', product.color),
    feature('brand', product.brand),
    feature('retailer', product.retailerId),
    feature('price', priceBandOf(product, bands)),
  ];
}

/**
 * Rebuild the taste profile from the swipe log. Swipes whose product isn't in
 * `productsById` are ignored (e.g. a product that was removed from the catalog).
 */
export function buildTasteProfile(
  swipes: readonly SwipeEvent[],
  productsById: ReadonlyMap<string, Product>,
  bands: PriceBands,
  options: RecommenderOptions = DEFAULT_OPTIONS,
  /** Styles picked on first launch. Each counts like one keep of that style, older than any real swipe. */
  seedStyles: readonly string[] = [],
): TasteProfile {
  const newestFirst = [...swipes].sort((a, b) => b.swipedAt - a.swipedAt);
  const raw: Record<string, number> = {};
  let totalWeight = 0;
  let keepCount = 0;
  let index = 0;

  for (const swipe of newestFirst) {
    const product = productsById.get(swipe.productId);
    if (!product) continue;
    const decay = Math.pow(0.5, index / options.halfLifeSwipes);
    index++;
    const sign = swipe.direction === 'keep' ? 1 : -options.skipWeight;
    if (swipe.direction === 'keep') keepCount++;
    totalWeight += decay;
    for (const f of productFeatures(product, bands)) {
      raw[f.key] = (raw[f.key] ?? 0) + sign * decay;
    }
  }

  // Picks sit behind every real swipe, so they fade as real taste builds up.
  const seedDecay = Math.pow(0.5, index / options.halfLifeSwipes);
  const seeds = [...new Set(seedStyles.map((s) => s.toLowerCase()))];
  for (const style of seeds) {
    const key = feature('style', style).key;
    raw[key] = (raw[key] ?? 0) + seedDecay;
    totalWeight += seedDecay;
  }

  const weights: Record<string, number> = {};
  if (totalWeight > 0) {
    for (const key of Object.keys(raw)) weights[key] = raw[key] / totalWeight;
  }
  return { weights, keepCount, swipeCount: index, seeded: seeds.length >= options.coldStartKeeps };
}

export function isColdStart(profile: TasteProfile, options: RecommenderOptions = DEFAULT_OPTIONS): boolean {
  return profile.keepCount < options.coldStartKeeps && !profile.seeded;
}

export function scoreProduct(
  product: Product,
  profile: TasteProfile,
  bands: PriceBands,
  options: RecommenderOptions = DEFAULT_OPTIONS,
): { score: number; reasons: Feature[] } {
  const features = productFeatures(product, bands);
  const styleCount = Math.max(1, product.styleTags.length);
  let score = 0;
  const contributions: { f: Feature; c: number }[] = [];

  for (const f of features) {
    const affinity = profile.weights[f.key] ?? 0;
    // Average across style tags so multi-tag products aren't favoured just for having more tags.
    const perFeature = f.kind === 'style' ? 1 / styleCount : 1;
    const c = affinity * options.featureWeights[f.kind] * perFeature;
    score += c;
    contributions.push({ f, c });
  }

  const reasons = contributions
    .filter(({ f, c }) => c >= options.reasonThreshold && f.kind !== 'retailer')
    .sort((a, b) => b.c - a.c)
    .slice(0, 2)
    .map(({ f }) => f);

  return { score, reasons };
}

/** Shuffle, then spread items out so neighbours rarely share a primary style. */
function diverseShuffle(products: readonly Product[], seed: number): Product[] {
  const rng = createRng(seed);
  const pool = [...products].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: Product[] = [];
  while (pool.length > 0) {
    const last = out[out.length - 1]?.styleTags[0];
    const idx = pool.findIndex((p) => p.styleTags[0] !== last);
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

export interface RankOptions {
  bands: PriceBands;
  seed: number;
  options?: RecommenderOptions;
}

export function rankProducts(
  candidates: readonly Product[],
  profile: TasteProfile,
  { bands, seed, options = DEFAULT_OPTIONS }: RankOptions,
): RankedProduct[] {
  if (isColdStart(profile, options)) {
    return diverseShuffle(candidates, seed).map((product) => ({
      product,
      score: 0,
      reasons: [],
      explored: false,
    }));
  }

  const scored = candidates
    .map((product) => ({ product, ...scoreProduct(product, profile, bands, options), explored: false }))
    .sort((a, b) => b.score - a.score || (a.product.id < b.product.id ? -1 : 1));

  const rng = createRng(seed);
  const out: RankedProduct[] = [];
  while (scored.length > 0) {
    if (scored.length > 3 && rng() < options.explorationRate) {
      // Pick something from the lower half of what's left.
      const half = Math.floor(scored.length / 2);
      const idx = half + Math.floor(rng() * (scored.length - half));
      const [item] = scored.splice(idx, 1);
      out.push({ ...item, reasons: [], explored: true });
    } else {
      out.push(scored.shift()!);
    }
  }
  return out;
}

/**
 * Re-rank a deck after a swipe while leaving the first `pinned` cards alone,
 * so the cards the user can already see never jump around.
 */
export function rerankQueue(
  queue: readonly RankedProduct[],
  profile: TasteProfile,
  rank: RankOptions,
  pinned = 2,
): RankedProduct[] {
  const head = queue.slice(0, pinned);
  const tail = rankProducts(
    queue.slice(pinned).map((r) => r.product),
    profile,
    rank,
  );
  return [...head, ...tail];
}

const PRICE_LABEL: Record<PriceBand, string> = {
  low: 'lower prices',
  mid: 'mid-range prices',
  high: 'premium pieces',
};

/** "Matches your taste for walnut and mid-century", or null if no strong reason. */
/** Short display labels for reasons, e.g. ["mid-century", "walnut"]. */
export function reasonLabels(reasons: readonly Feature[]): string[] {
  return reasons.map((r) => (r.kind === 'price' ? PRICE_LABEL[r.value as PriceBand] : r.label));
}

export function formatReasons(reasons: readonly Feature[]): string | null {
  if (reasons.length === 0) return null;
  return `Matches your taste for ${reasonLabels(reasons).join(' and ')}`;
}
