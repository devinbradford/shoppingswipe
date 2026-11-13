/**
 * Engine Lab policies: anything that orders a deck. V2 is the production engine, called exactly
 * as useDeck calls it. The others are reference points, not candidates for shipping:
 *
 * - random:  eligible products in a seeded random order, no learning ("randomized discovery").
 * - content: tag similarity to what was kept minus what was skipped (Jaccard on the same visible
 *            features V2 reads), no exploration, no uncertainty. A simple content-based baseline.
 * - oracle:  sorted by the shopper's hidden utility. An unreachable upper bound used only to put
 *            numbers in context; it reads the ground truth, which no real engine can.
 *
 * A future V3 plugs in by implementing `Policy`; every scenario, seed and metric stays the same.
 */
import type { Product, SwipeEvent } from '../../domain/types';
import type { PriceBands, RankedProduct } from '../engine';
import { buildTasteModel } from '../model';
import { createRng } from '../random';
import { rankDeck, rerankDeck } from '../rank';
import type { EngagementSignal } from '../signals';

export interface PolicyContext {
  swipes: readonly SwipeEvent[];
  signals: readonly EngagementSignal[];
  /** Every product the app knows about (candidates + swiped), like useDeck's `known`. */
  known: ReadonlyMap<string, Product>;
  bands: PriceBands;
  statedStyles: readonly string[];
  statedBudget: { subcategoryId: Product['subcategoryId']; maxCents: number } | null;
  /** Oracle only: the shopper's hidden utility right now. */
  oracle?: (p: Product) => number;
}

export interface Policy {
  name: string;
  /** Order a fresh batch of candidates (deck load or refill). */
  rank(candidates: readonly Product[], ctx: PolicyContext, seed: number): Product[];
  /** Re-order after a swipe; the first `pinned` cards are already on screen and must stay. */
  rerank(queue: readonly Product[], ctx: PolicyContext, seed: number, position: number): Product[];
}

const PINNED = 2;
const asRanked = (p: Product): RankedProduct => ({ product: p, score: 0, reasons: [], explored: false });

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = [...items].sort((a, b) => ((a as Product).id < (b as Product).id ? -1 : 1));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export const v2Policy: Policy = {
  name: 'v2',
  rank(candidates, ctx, seed) {
    return rankDeck(candidates, modelFor(ctx), { bands: ctx.bands, seed }).map((r) => r.product);
  },
  rerank(queue, ctx, seed, position) {
    return rerankDeck(queue.map(asRanked), modelFor(ctx), { bands: ctx.bands, seed, position }, PINNED).map((r) => r.product);
  },
};

function modelFor(ctx: PolicyContext) {
  return buildTasteModel({
    swipes: ctx.swipes,
    products: ctx.known,
    bands: ctx.bands,
    signals: ctx.signals,
    feedback: [],
    seedStyles: ctx.statedStyles,
    statedBudget: ctx.statedBudget,
  });
}

export const randomPolicy: Policy = {
  name: 'random',
  rank: (candidates, _ctx, seed) => shuffle(candidates, seed),
  rerank: (queue) => [...queue],
};

const keysOf = (p: Product) => [...p.styleTags.map((s) => `s:${s}`), `m:${p.material}`, `c:${p.color}`];
function jaccard(a: readonly string[], b: readonly string[]): number {
  let shared = 0;
  for (const k of a) if (b.includes(k)) shared++;
  return shared / (a.length + b.length - shared || 1);
}

function contentScores(items: readonly Product[], ctx: PolicyContext): Map<string, number> {
  const kept: string[][] = [];
  const skipped: string[][] = [];
  for (const s of ctx.swipes) {
    const p = ctx.known.get(s.productId);
    if (p) (s.direction === 'keep' ? kept : skipped).push(keysOf(p));
  }
  for (const style of ctx.statedStyles) kept.push([`s:${style}`]);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return new Map(
    items.map((p) => {
      const k = keysOf(p);
      return [p.id, mean(kept.map((x) => jaccard(k, x))) - 0.5 * mean(skipped.map((x) => jaccard(k, x)))];
    }),
  );
}

export const contentPolicy: Policy = {
  name: 'content',
  rank(candidates, ctx, seed) {
    const shuffled = shuffle(candidates, seed); // ties (e.g. no evidence yet) in random order
    if (ctx.swipes.length === 0 && ctx.statedStyles.length === 0) return shuffled;
    const score = contentScores(shuffled, ctx);
    return shuffled.map((p, i) => ({ p, i })).sort((a, b) => score.get(b.p.id)! - score.get(a.p.id)! || a.i - b.i).map((x) => x.p);
  },
  rerank(queue, ctx, seed) {
    return [...queue.slice(0, PINNED), ...this.rank(queue.slice(PINNED), ctx, seed)];
  },
};

export const oraclePolicy: Policy = {
  name: 'oracle',
  rank(candidates, ctx) {
    const u = new Map(candidates.map((p) => [p.id, ctx.oracle!(p)]));
    return [...candidates].sort((a, b) => u.get(b.id)! - u.get(a.id)! || (a.id < b.id ? -1 : 1));
  },
  rerank(queue, ctx, seed) {
    return [...queue.slice(0, PINNED), ...this.rank(queue.slice(PINNED), ctx, seed)];
  },
};

export const POLICIES: Record<string, Policy> = {
  v2: v2Policy,
  random: randomPolicy,
  content: contentPolicy,
  oracle: oraclePolicy,
};
