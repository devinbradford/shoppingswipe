/**
 * Ranking v2: orders a deck using the taste model (model.ts).
 *
 * Pure TypeScript (see engine.ts).
 *
 *  - Score: each feature's affinity × its importance (style matters most),
 *    minus a push-down for confident dislikes and for pieces above the
 *    shopper's learned price ceiling.
 *  - Exploration that learns (Thompson sampling): every re-rank adds a little
 *    randomness in proportion to how UNSURE we are about each feature, so
 *    untested materials and colors get a fair try while proven dislikes don't.
 *    Plus a "probe" card about every 7th slot: the piece that would teach us
 *    the most, never a confident dislike or far over budget.
 *  - Variety: near-twins of the last few cards are held back (MMR), so the
 *    deck doesn't show three cream sofas in a row.
 *  - Cold start: the first cards are chosen to cover as many styles, materials
 *    and colors as possible, so the first handful of swipes teaches the most.
 */
import type { Product } from '../domain/types';
import {
  DEFAULT_OPTIONS,
  productFeatures,
  type Feature,
  type FeatureKind,
  type PriceBands,
  type RankedProduct,
} from './engine';
import { affinity, priceRatio, type Affinity, type TasteModel } from './model';
import { createRng, type Rng } from './random';

export interface RankV2Options {
  featureWeights: Record<FeatureKind, number>;
  /** Minimum contribution to name a feature in "For you". */
  reasonThreshold: number;
  /** How bold exploration is (0 = always the best guess). */
  thompsonScale: number;
  /** One probe card every N slots (0 = none). */
  probeEvery: number;
  /** Push-down for looking like one of the last 3 cards (0..1 similarity × this). */
  diversityPenalty: number;
  /** Push-down per unit (ln price ratio) over the price ceiling. */
  budgetPenalty: number;
  /** Feature counted as a confident dislike below this mean, with at least `hardNegativeN` evidence. */
  hardNegativeMean: number;
  hardNegativeN: number;
  hardNegativePenalty: number;
}

export const RANK_OPTIONS: RankV2Options = {
  featureWeights: DEFAULT_OPTIONS.featureWeights,
  reasonThreshold: 0.25,
  thompsonScale: 0.15,
  probeEvery: 7,
  diversityPenalty: 0.45,
  budgetPenalty: 1.6,
  hardNegativeMean: -0.6,
  hardNegativeN: 2.5,
  hardNegativePenalty: 0.6,
};

export interface DeckRankOptions {
  bands: PriceBands;
  seed: number;
  options?: RankV2Options;
  /** How many cards came before this ranking in the deck (keeps the probe rhythm steady across re-ranks). */
  position?: number;
  /** The cards just before this ranking (for variety). */
  before?: readonly Product[];
}

interface Scored {
  product: Product;
  mean: number;
  sampled: number;
  uncertainty: number;
  reasons: Feature[];
  /** Confident dislike or well over budget: never used as a probe. */
  avoid: boolean;
  /** Feature keys used for "looks like" comparisons. */
  look: string[];
}

function normal(rng: Rng): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function lookKeys(product: Product, features: Feature[]): string[] {
  return [
    ...features.filter((f) => f.kind !== 'price' && f.kind !== 'retailer').map((f) => f.key),
    `type:${product.subcategoryId}`,
  ];
}

function similarity(a: string[], b: string[]): number {
  let shared = 0;
  for (const k of a) if (b.includes(k)) shared++;
  return shared / (a.length + b.length - shared);
}

/** Scores every candidate. Exported for tests and the benchmark. */
export function scoreCandidates(
  candidates: readonly Product[],
  model: TasteModel,
  { bands, seed, options = RANK_OPTIONS }: DeckRankOptions,
): Scored[] {
  const rng = createRng(seed ^ 0x9e3779b9);
  const cache = new Map<string, Affinity & { draw: number }>();
  const aff = (key: string) => {
    let a = cache.get(key);
    if (!a) {
      a = { ...affinity(model, key), draw: normal(rng) };
      cache.set(key, a);
    }
    return a;
  };
  const budget = model.budget;

  return candidates.map((product) => {
    const features = productFeatures(product, bands);
    const styleCount = Math.max(1, product.styleTags.length);
    let mean = 0;
    let sampled = 0;
    let uncertainty = 0;
    let avoid = false;
    const contributions: { f: Feature; c: number }[] = [];
    for (const f of features) {
      const a = aff(f.key);
      const w = options.featureWeights[f.kind] * (f.kind === 'style' ? 1 / styleCount : 1);
      const c = a.mean * w;
      mean += c;
      sampled += (a.mean + options.thompsonScale * a.sd * a.draw) * w;
      uncertainty += a.sd * w;
      contributions.push({ f, c });
      if (a.mean <= options.hardNegativeMean && a.n >= options.hardNegativeN) {
        mean -= options.hardNegativePenalty * w;
        sampled -= options.hardNegativePenalty * w;
        avoid = true;
      }
    }
    if (budget) {
      const over = priceRatio(product, bands) - budget.ceiling;
      if (over > 0) {
        const p = Math.min(2, over * options.budgetPenalty) * budget.confidence;
        mean -= p;
        sampled -= p;
        if (over > 0.25 && budget.confidence >= 0.5) avoid = true;
      }
    }
    const reasons = contributions
      .filter(({ f, c }) => c >= options.reasonThreshold && f.kind !== 'retailer')
      .sort((x, y) => y.c - x.c)
      .slice(0, 2)
      .map(({ f }) => f);
    return { product, mean, sampled, uncertainty, reasons, avoid, look: lookKeys(product, features) };
  });
}

/** First cards for a new shopper: cover as many styles, materials and colors as possible. */
function informativeStart(candidates: readonly Product[], seed: number): Product[] {
  const rng = createRng(seed);
  const pool = [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const shown = new Set<string>();
  const out: Product[] = [];
  const window = Math.min(pool.length, 300);
  for (let step = 0; step < 24 && out.length < window; step++) {
    let best = -1;
    let bestGain = -1;
    for (let i = 0; i < Math.min(pool.length, window - out.length); i++) {
      const p = pool[i];
      const keys = [...p.styleTags.map((s) => `s:${s}`), `m:${p.material}`, `c:${p.color}`];
      const gain = keys.filter((k) => !shown.has(k)).length / keys.length;
      if (gain > bestGain) {
        bestGain = gain;
        best = i;
      }
    }
    if (best < 0) break;
    const [p] = pool.splice(best, 1);
    for (const s of p.styleTags) shown.add(`s:${s}`);
    shown.add(`m:${p.material}`);
    shown.add(`c:${p.color}`);
    out.push(p);
  }
  return [...out, ...pool];
}

/** True only before the very first swipe: from then on every swipe (keep or skip) shapes the deck. */
function firstCards(model: TasteModel): boolean {
  return model.swipeCount === 0 && model.positiveCount === 0 && !model.seeded;
}

export function rankDeck(candidates: readonly Product[], model: TasteModel, rank: DeckRankOptions): RankedProduct[] {
  const options = rank.options ?? RANK_OPTIONS;
  if (firstCards(model)) {
    return informativeStart(candidates, rank.seed).map((product) => ({
      product,
      score: 0,
      reasons: [],
      explored: false,
    }));
  }

  const scored = scoreCandidates(candidates, model, rank).sort(
    (a, b) => b.sampled - a.sampled || (a.product.id < b.product.id ? -1 : 1),
  );
  const POOL = 300;
  const pool = scored.slice(0, POOL);
  const tail = scored.slice(POOL);
  const out: RankedProduct[] = [];
  const recent: string[][] = (rank.before ?? []).slice(-3).map((p) => lookKeys(p, productFeatures(p, rank.bands)));
  const position = rank.position ?? 0;

  // Only the first few slots are ever seen before the next re-rank, so polish those.
  const POLISH = 40;
  for (let slot = 0; pool.length > 0 && slot < POLISH; slot++) {
    let idx = 0;
    let explored = false;
    const probeSlot =
      options.probeEvery > 0 && (position + slot) % options.probeEvery === options.probeEvery - 1 && pool.length > 3;
    if (probeSlot) {
      // The piece we'd learn the most from, as long as it isn't a known dislike.
      let best = -1;
      let bestValue = -Infinity;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (s.avoid || s.mean < -0.3) continue;
        const value = s.uncertainty + 0.3 * s.mean;
        if (value > bestValue) {
          bestValue = value;
          best = i;
        }
      }
      if (best >= 0) {
        idx = best;
        explored = true;
      }
    }
    if (!explored) {
      let bestValue = -Infinity;
      const look = Math.min(pool.length, 60);
      for (let i = 0; i < look; i++) {
        const s = pool[i];
        let maxSim = 0;
        for (const r of recent) maxSim = Math.max(maxSim, similarity(s.look, r));
        const value = s.sampled - options.diversityPenalty * maxSim;
        if (value > bestValue) {
          bestValue = value;
          idx = i;
        }
      }
    }
    const [s] = pool.splice(idx, 1);
    recent.push(s.look);
    if (recent.length > 3) recent.shift();
    out.push({ product: s.product, score: s.mean, reasons: explored ? [] : s.reasons, explored });
  }
  for (const s of pool) out.push({ product: s.product, score: s.mean, reasons: s.reasons, explored: false });
  for (const s of tail) out.push({ product: s.product, score: s.mean, reasons: s.reasons, explored: false });
  return out;
}

/** Re-rank after a swipe, leaving the cards the shopper can already see in place. */
export function rerankDeck(
  queue: readonly RankedProduct[],
  model: TasteModel,
  rank: DeckRankOptions,
  pinned = 2,
): RankedProduct[] {
  const head = queue.slice(0, pinned);
  return [
    ...head,
    ...rankDeck(
      queue.slice(pinned).map((r) => r.product),
      model,
      { ...rank, position: (rank.position ?? 0) + head.length, before: head.map((r) => r.product) },
    ),
  ];
}
