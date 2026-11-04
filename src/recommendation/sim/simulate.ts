/**
 * Simulated shoppers: a test lab for the recommender.
 *
 * Each shopper has a hidden taste (liked/disliked styles, materials, colors)
 * and a hidden budget. They swipe through a real deck one card at a time, the
 * way a person would, with some randomness: keeping what they'd like, skipping
 * fast when they dislike something, sometimes opening details or tapping Buy
 * now, and sometimes answering (or ignoring) the app's questions.
 *
 * We then score how well each engine did. Used by the benchmark test and
 * `npm run engine-report`. Caveat: shoppers' tastes are expressed in the same
 * features the engine sees, so real-world gains will be smaller and depend on
 * real product data.
 */
import type { Product, SwipeEvent } from '../../domain/types';
import {
  buildTasteProfile,
  computePriceBands,
  rankProducts,
  rerankQueue,
  type PriceBands,
  type RankedProduct,
} from '../engine';
import { buildTasteModel, priceRatio } from '../model';
import { rankDeck, rerankDeck } from '../rank';
import { EMPTY_QUESTION_STATE, markAsked, nextQuestion, type QuestionState, type SessionSwipe } from '../questions';
import type { EngagementSignal, Feedback, SkipReason } from '../signals';
import { createRng, hashSeed, pickSome, type Rng } from '../random';

export type EngineName = 'v1' | 'v2' | 'v2-no-questions';

export interface Shopper {
  id: number;
  weights: Record<string, number>;
  /** ln price ratio above which they lose interest. */
  ceiling: number;
  /** Fixed per-product noise: taste isn't only features. */
  noise: Map<string, number>;
  /** Styles they'd tap on the welcome screen (empty = skipped it). */
  picks: string[];
  rng: Rng;
}

export interface SessionResult {
  engine: EngineName;
  keeps: boolean[];
  utilities: number[];
  overBudget: boolean[];
  hitsDislike: boolean[];
  similarities: number[];
  questions: number;
  answered: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function makeShopper(id: number, catalog: readonly Product[], withPicks: boolean): Shopper {
  const rng = createRng(hashSeed(`shopper:${id}`));
  const styles = [...new Set(catalog.flatMap((p) => p.styleTags))].sort();
  const materials = [...new Set(catalog.map((p) => p.material))].sort();
  const colors = [...new Set(catalog.map((p) => p.color))].sort();
  const w: Record<string, number> = {};
  const [l1, l2, d1, d2] = pickSome(rng, styles, 4);
  w[`style:${l1}`] = 1.2;
  w[`style:${l2}`] = 0.9;
  w[`style:${d1}`] = -1.2;
  w[`style:${d2}`] = -0.8;
  const [m1, m2, mh] = pickSome(rng, materials, 3);
  w[`material:${m1}`] = 0.8;
  w[`material:${m2}`] = 0.4;
  w[`material:${mh}`] = -1.4;
  const [c1, c2, ch1, ch2] = pickSome(rng, colors, 4);
  w[`color:${c1}`] = 0.6;
  w[`color:${c2}`] = 0.4;
  w[`color:${ch1}`] = -0.8;
  w[`color:${ch2}`] = -0.5;
  const ceiling = -0.4 + rng() * 1.1;
  const picks = withPicks ? [l1, l2, pickSome(rng, styles, 1)[0]] : [];
  return { id, weights: w, ceiling, noise: new Map(), picks, rng };
}

export function utility(shopper: Shopper, product: Product, bands: PriceBands): number {
  let u = 0;
  for (const s of product.styleTags) u += (shopper.weights[`style:${s}`] ?? 0) / Math.sqrt(product.styleTags.length);
  u += shopper.weights[`material:${product.material}`] ?? 0;
  u += shopper.weights[`color:${product.color}`] ?? 0;
  const over = priceRatio(product, bands) - shopper.ceiling;
  if (over > 0) u -= 2 * over;
  let n = shopper.noise.get(product.id);
  if (n === undefined) {
    n = (shopper.rng() + shopper.rng() + shopper.rng() - 1.5) * 0.6;
    shopper.noise.set(product.id, n);
  }
  return u + n;
}

function look(p: Product): string[] {
  return [...p.styleTags.map((s) => `style:${s}`), `material:${p.material}`, `color:${p.color}`, `type:${p.subcategoryId}`];
}

function jaccard(a: string[], b: string[]): number {
  const shared = a.filter((k) => b.includes(k)).length;
  return shared / (a.length + b.length - shared);
}

export function runSession(
  engine: EngineName,
  shopper: Shopper,
  candidates: readonly Product[],
  bands: PriceBands,
  swipesPerSession = 60,
): SessionResult {
  // Fresh randomness per engine so engines see the same shopper fairly.
  const rng = createRng(hashSeed(`session:${shopper.id}:${engine}`));
  const products = new Map(candidates.map((p) => [p.id, p]));
  const swipes: SwipeEvent[] = [];
  const signals: EngagementSignal[] = [];
  const feedback: Feedback[] = [];
  const session: SessionSwipe[] = [];
  let qstate: QuestionState = EMPTY_QUESTION_STATE;
  const result: SessionResult = {
    engine,
    keeps: [],
    utilities: [],
    overBudget: [],
    hitsDislike: [],
    similarities: [],
    questions: 0,
    answered: 0,
  };

  const v2 = engine !== 'v1';
  const model = () =>
    buildTasteModel({ swipes, products, bands, signals, feedback, seedStyles: shopper.picks });
  const profile = () => buildTasteProfile(swipes, products, bands, undefined, shopper.picks);
  const seed = (n: number) => hashSeed(`${shopper.id}:${engine}:${n}`);

  let deck: RankedProduct[] = v2
    ? rankDeck(candidates, model(), { bands, seed: seed(0) })
    : rankProducts(candidates, profile(), { bands, seed: seed(0) });
  let prevLook: string[] | null = null;
  let t = 1_000_000;

  for (let i = 0; i < swipesPerSession && deck.length > 0; i++) {
    const [top, ...rest] = deck;
    const p = top.product;
    const u = utility(shopper, p, bands);
    const keep = rng() < sigmoid(2.2 * (u - 0.3));
    const dwellMs = u < -0.8 ? 450 : Math.abs(u) < 0.3 ? 4500 : 1800;
    t += 5000;

    result.keeps.push(keep);
    result.utilities.push(u);
    result.overBudget.push(priceRatio(p, bands) > shopper.ceiling + 0.15);
    result.hitsDislike.push(look(p).some((k) => (shopper.weights[k] ?? 0) <= -1));
    const l = look(p);
    if (prevLook) result.similarities.push(jaccard(l, prevLook));
    prevLook = l;

    swipes.push({ id: `s${i}`, productId: p.id, categoryId: p.categoryId, direction: keep ? 'keep' : 'skip', swipedAt: t });
    if (v2) {
      signals.push({ id: `d${i}`, productId: p.id, type: 'swipe_dwell', at: t, value: dwellMs });
      if (keep && u > 1) {
        if (rng() < 0.5) signals.push({ id: `o${i}`, productId: p.id, type: 'detail_open', at: t + 1 });
        if (rng() < 0.5) signals.push({ id: `b${i}`, productId: p.id, type: 'photo_browse', at: t + 2 });
        if (rng() < 0.25) signals.push({ id: `l${i}`, productId: p.id, type: 'list_add', at: t + 3 });
        if (rng() < 0.05) signals.push({ id: `c${i}`, productId: p.id, type: 'buy_click', at: t + 4 });
      }
    }
    session.push({
      product: p,
      direction: keep ? 'keep' : 'skip',
      dwellMs,
      predicted: top.score,
      forYou: top.reasons.length > 0,
    });

    if (engine === 'v2') {
      const q = nextQuestion(session, model(), bands, qstate);
      if (q) {
        result.questions++;
        qstate = markAsked(qstate, q, session.length);
        let answered = false;
        if (q.type === 'feature') {
          const hw = shopper.weights[q.featureKey] ?? 0;
          const priceDislike = q.kind === 'price';
          if ((hw <= -0.5 || priceDislike) && rng() < 0.75) {
            feedback.push({ id: `f${i}`, at: t + 10, kind: 'feature', featureKey: q.featureKey, answer: 'less' });
            answered = true;
          } else if (hw > -0.1 && !priceDislike && rng() < 0.6) {
            feedback.push({ id: `f${i}`, at: t + 10, kind: 'feature', featureKey: q.featureKey, answer: 'fine' });
            answered = true;
          }
        } else if (rng() < 0.7) {
          const parts: [SkipReason, number][] = [
            ['style', Math.min(0, ...p.styleTags.map((s) => shopper.weights[`style:${s}`] ?? 0))],
            ['material', shopper.weights[`material:${p.material}`] ?? 0],
            ['color', shopper.weights[`color:${p.color}`] ?? 0],
            ['price', priceRatio(p, bands) > shopper.ceiling ? -2 * (priceRatio(p, bands) - shopper.ceiling) : 0],
          ];
          const worst = parts.sort((a, b) => a[1] - b[1])[0];
          if (worst[1] < 0) {
            feedback.push({ id: `f${i}`, at: t + 10, kind: 'skip_reason', productId: p.id, reason: worst[0] });
            answered = true;
          }
        }
        if (answered) result.answered++;
        qstate = { ...qstate, ignoredStreak: answered ? 0 : qstate.ignoredStreak + 1 };
      }
    }

    deck = v2
      ? rerankDeck(rest, model(), { bands, seed: seed(i + 1), position: i + 1 })
      : rerankQueue(rest, profile(), { bands, seed: seed(i + 1) });
  }
  return result;
}

export interface Scorecard {
  engine: EngineName;
  shoppers: number;
  keepRateFirst10: number;
  keepRateSwipes11to30: number;
  keepRateSwipes31to60: number;
  swipesToTaste: number;
  avgUtilityLate: number;
  overBudgetLate: number;
  dislikesShownLate: number;
  lookAlikeNeighbours: number;
  questionsPer50: number;
  answeredShare: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (xs: boolean[]) => mean(xs.map((x) => (x ? 1 : 0)));

export function summarize(engine: EngineName, results: SessionResult[]): Scorecard {
  const toTaste = results.map((r) => {
    for (let t = 9; t < r.keeps.length; t++) {
      if (r.keeps.slice(t - 9, t + 1).filter(Boolean).length >= 6) return t + 1;
    }
    return r.keeps.length + 1;
  });
  return {
    engine,
    shoppers: results.length,
    keepRateFirst10: mean(results.map((r) => rate(r.keeps.slice(0, 10)))),
    keepRateSwipes11to30: mean(results.map((r) => rate(r.keeps.slice(10, 30)))),
    keepRateSwipes31to60: mean(results.map((r) => rate(r.keeps.slice(30, 60)))),
    swipesToTaste: mean(toTaste),
    avgUtilityLate: mean(results.map((r) => mean(r.utilities.slice(30, 60)))),
    overBudgetLate: mean(results.map((r) => rate(r.overBudget.slice(30, 60)))),
    dislikesShownLate: mean(results.map((r) => rate(r.hitsDislike.slice(30, 60)))),
    lookAlikeNeighbours: mean(results.map((r) => rate(r.similarities.map((s) => s >= 0.6)))),
    questionsPer50: mean(results.map((r) => (r.questions / Math.max(1, r.keeps.length)) * 50)),
    answeredShare: mean(results.filter((r) => r.questions > 0).map((r) => r.answered / r.questions)),
  };
}

export interface BenchmarkOptions {
  shoppers: number;
  perSubcategory: number;
  withPicks: boolean;
  swipes: number;
}

/** Runs every engine on the same shoppers. `catalog` should be one room's products. */
export function benchmark(
  catalog: readonly Product[],
  { shoppers, withPicks, swipes }: Omit<BenchmarkOptions, 'perSubcategory'>,
  engines: EngineName[] = ['v1', 'v2-no-questions', 'v2'],
): Scorecard[] {
  const bands = computePriceBands(catalog);
  return engines.map((engine) => {
    const results: SessionResult[] = [];
    for (let i = 0; i < shoppers; i++) {
      results.push(runSession(engine, makeShopper(i, catalog, withPicks), catalog, bands, swipes));
    }
    return summarize(engine, results);
  });
}
