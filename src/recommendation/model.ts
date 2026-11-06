/**
 * Taste model v2: what the shopper likes, how sure we are, and their budget.
 *
 * Pure TypeScript (see engine.ts): no React, no I/O, relative imports only.
 *
 * Compared with the v1 profile in engine.ts:
 *  - Learns from every action, weighted by how much it says: Buy now (×3),
 *    adding to a list (×2), opening details, browsing photos, keeps, skips.
 *    Quick skips count more than slow, hesitant ones; un-keeping counts against.
 *  - Keeps evidence for and against each feature separately, so it knows how
 *    SURE it is, not just the direction. Unsure features get tested
 *    (exploration in rank.ts); confident dislikes are avoided.
 *  - Measures each feature against the shopper's overall keep rate, so someone
 *    who keeps everything doesn't look like they love every feature.
 *  - Blends long-term taste with what they're into right now (this session).
 *  - Learns a price ceiling per shopper, relative to each product type
 *    (a $400 rug is pricey; a $400 sofa is not).
 *  - Applies answers to the occasional question: "less of this" mutes a
 *    feature; "no, just these" stops skips counting against it; "what put you
 *    off?" pins a skip on one aspect instead of blaming everything.
 */
import type { Product, SwipeEvent } from '../domain/types';
import { productFeatures, type FeatureKind, type PriceBands } from './engine';
import {
  FAST_SKIP_MS,
  PHOTO_BROWSE_CAP,
  SIGNAL_WEIGHTS,
  SLOW_SKIP_MS,
  type EngagementSignal,
  type Feedback,
  type SkipReason,
} from './signals';

export interface ModelOptions {
  /** After this many newer swipes, an action counts half as much (long-term taste). */
  longHalfLife: number;
  /** Same, for "right now" taste. */
  shortHalfLife: number;
  /** How much right-now taste counts once there's enough of it (0..1). */
  shortBlend: number;
  skipWeight: number;
  /** Pseudo-count pulling unproven features toward neutral. */
  prior: number;
  /** Each first-launch style pick counts like this many keeps. */
  seedWeight: number;
  /** Keeps (or list adds / buys) needed before ranking is personal. */
  coldStartKeeps: number;
  /** How far one feature's effect can stray from neutral before evidence (log-odds sd). */
  priorSd: number;
  /** Starting effect of a first-launch style pick, and of a "less of this" answer. */
  seedPrior: number;
  mutedPrior: number;
  /** Starting effect of a "show me more" answer. */
  boostPrior: number;
}

export const MODEL_OPTIONS: ModelOptions = {
  longHalfLife: 40,
  shortHalfLife: 8,
  shortBlend: 0.3,
  skipWeight: 0.6,
  prior: 2,
  seedWeight: 1.5,
  coldStartKeeps: 3,
  priorSd: 1,
  seedPrior: 0.8,
  mutedPrior: -2.5,
  boostPrior: 1.2,
};

export interface Evidence {
  pos: number;
  neg: number;
}

export interface Budget {
  /** Typical price, as ln(price ÷ typical price for that product type). */
  center: number;
  /** Above this (same units), pieces are pushed down. */
  ceiling: number;
  /** 0..1: how much to trust the ceiling. */
  confidence: number;
}

export interface FittedWeight {
  /** Learned effect on the chance of a keep (log-odds). */
  mean: number;
  /** Uncertainty of that effect. */
  sd: number;
}

export interface TasteModel {
  /** Per-shopper preference model fitted to every action (see fitPreferences). */
  weights: Record<string, FittedWeight>;
  /** Their general tendency to keep, log-odds. */
  bias: number;
  /** Uncertainty for features never seen yet. */
  priorSd: number;
  /** Raw evidence, used for questions ("you used to keep walnut"). */
  long: Record<string, Evidence>;
  short: Record<string, Evidence>;
  /** Overall share of positive reactions, long-term and right now. */
  baseRate: number;
  shortBaseRate: number;
  /** Total weight behind the right-now view. */
  shortMass: number;
  budget: Budget | null;
  /** Features the shopper asked to see less of. */
  muted: string[];
  /** Features the shopper asked to see more of. */
  boosted: string[];
  /** Features the shopper said their skips weren't about. */
  fine: string[];
  keepCount: number;
  swipeCount: number;
  /** Keeps plus products added to a list or bought without a keep. */
  positiveCount: number;
  seeded: boolean;
  /** Feature key → display label, e.g. `material:boucle` → "boucle". */
  labels: Record<string, string>;
  options: ModelOptions;
}

export interface TasteInput {
  swipes: readonly SwipeEvent[];
  products: ReadonlyMap<string, Product>;
  bands: PriceBands;
  signals?: readonly EngagementSignal[];
  feedback?: readonly Feedback[];
  seedStyles?: readonly string[];
  /** Budget from onboarding: a price cap for one product type, scaled to the others. */
  statedBudget?: { subcategoryId: Product['subcategoryId']; maxCents: number } | null;
  options?: ModelOptions;
}

export const EMPTY_MODEL: TasteModel = {
  weights: {},
  bias: 0,
  priorSd: 1,
  long: {},
  short: {},
  baseRate: 0.5,
  shortBaseRate: 0.5,
  shortMass: 0,
  budget: null,
  muted: [],
  boosted: [],
  fine: [],
  keepCount: 0,
  swipeCount: 0,
  positiveCount: 0,
  seeded: false,
  labels: {},
  options: MODEL_OPTIONS,
};

const REASON_KIND: Record<SkipReason, FeatureKind> = {
  style: 'style',
  price: 'price',
  color: 'color',
  material: 'material',
};

/** ln(price ÷ typical price for its product type); 0 when unknown. */
export function priceRatio(product: Pick<Product, 'priceCents' | 'subcategoryId'>, bands: PriceBands): number {
  const b = bands[product.subcategoryId];
  if (!b || b[0] <= 0 || b[1] <= 0 || product.priceCents <= 0) return 0;
  return Math.log(product.priceCents / Math.sqrt(b[0] * b[1]));
}

interface WeightedEvent {
  productId: string;
  /** Signed strength in keeps. */
  weight: number;
  /** Epoch ms, for decay. */
  at: number;
  /** Skips can be narrowed to one aspect by a "what put you off?" answer. */
  isSkip: boolean;
}

function add(map: Record<string, Evidence>, key: string, w: number): void {
  const e = map[key] ?? (map[key] = { pos: 0, neg: 0 });
  if (w >= 0) e.pos += w;
  else e.neg -= w;
}

export function buildTasteModel(input: TasteInput): TasteModel {
  const options = input.options ?? MODEL_OPTIONS;
  const { products, bands } = input;
  const signals = input.signals ?? [];
  const feedback = input.feedback ?? [];

  // "Start fresh": nothing before the latest reset counts.
  const resets = feedback.filter((f) => f.kind === 'reset').map((f) => f.at);
  const resetAt = resets.length > 0 ? Math.max(...resets) : -Infinity;
  const swipes = input.swipes.filter((s) => s.swipedAt > resetAt);

  // Latest answers win. "Forget" clears the answer and the evidence gathered before it.
  const featureAnswers = new Map<string, 'less' | 'fine' | 'more'>();
  const forgotAt = new Map<string, number>();
  const skipReasons = new Map<string, SkipReason>();
  for (const f of [...feedback].sort((a, b) => a.at - b.at)) {
    if (f.at <= resetAt) continue;
    if (f.kind === 'feature') {
      if (f.answer === 'forget') {
        featureAnswers.delete(f.featureKey);
        forgotAt.set(f.featureKey, f.at);
      } else featureAnswers.set(f.featureKey, f.answer);
    } else if (f.kind === 'skip_reason') skipReasons.set(f.productId, f.reason);
  }
  const muted = [...featureAnswers].filter(([, a]) => a === 'less').map(([k]) => k);
  const boosted = [...featureAnswers].filter(([, a]) => a === 'more').map(([k]) => k);
  const fine = new Set([...featureAnswers].filter(([, a]) => a === 'fine').map(([k]) => k));

  // Dwell per product (latest).
  const dwell = new Map<string, number>();
  for (const s of signals) if (s.type === 'swipe_dwell' && typeof s.value === 'number') dwell.set(s.productId, s.value);

  const events: WeightedEvent[] = [];
  let keepCount = 0;
  const kept = new Set<string>();
  for (const s of swipes) {
    if (!products.has(s.productId)) continue;
    if (s.direction === 'keep') {
      keepCount++;
      kept.add(s.productId);
      events.push({ productId: s.productId, weight: 1, at: s.swipedAt, isSkip: false });
    } else {
      const ms = dwell.get(s.productId);
      const factor = ms === undefined ? 1 : ms < FAST_SKIP_MS ? 1.5 : ms > SLOW_SKIP_MS ? 0.5 : 1;
      events.push({ productId: s.productId, weight: -options.skipWeight * factor, at: s.swipedAt, isSkip: true });
    }
  }

  // Engagement: once per product per type (photo browsing capped).
  const seen = new Map<string, WeightedEvent>();
  const strongPositive = new Set<string>();
  for (const s of signals) {
    if (s.type === 'swipe_dwell' || !products.has(s.productId) || s.at <= resetAt) continue;
    const key = `${s.type}:${s.productId}`;
    const w = SIGNAL_WEIGHTS[s.type];
    const prev = seen.get(key);
    if (s.type === 'photo_browse') {
      if (prev) {
        prev.weight = Math.min(PHOTO_BROWSE_CAP, prev.weight + w);
        prev.at = Math.max(prev.at, s.at);
        continue;
      }
    } else if (prev) {
      prev.at = Math.max(prev.at, s.at);
      continue;
    }
    const e = { productId: s.productId, weight: w, at: s.at, isSkip: false };
    seen.set(key, e);
    events.push(e);
    if (s.type === 'list_add' || s.type === 'buy_click' || s.type === 'purchase') strongPositive.add(s.productId);
  }
  const positiveCount = keepCount + [...strongPositive].filter((id) => !kept.has(id)).length;

  // Decay by how many swipes came after each action.
  const swipeTimes = swipes
    .filter((s) => products.has(s.productId))
    .map((s) => s.swipedAt)
    .sort((a, b) => a - b);
  const newerSwipes = (at: number) => {
    let lo = 0;
    let hi = swipeTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (swipeTimes[mid] <= at) lo = mid + 1;
      else hi = mid;
    }
    return swipeTimes.length - lo;
  };

  const long: Record<string, Evidence> = {};
  const short: Record<string, Evidence> = {};
  const labels: Record<string, string> = {};
  let P = 0;
  let N = 0;
  let sP = 0;
  let sN = 0;
  const pricePoints: { r: number; w: number }[] = [];
  const pricedOut: number[] = [];
  const samples: Sample[] = [];

  for (const e of events) {
    const product = products.get(e.productId)!;
    const age = newerSwipes(e.at);
    const dl = Math.pow(0.5, age / options.longHalfLife);
    const ds = Math.pow(0.5, age / options.shortHalfLife);
    const reason = e.isSkip ? skipReasons.get(e.productId) : undefined;

    if (e.weight >= 0) {
      P += e.weight * dl;
      sP += e.weight * ds;
      pricePoints.push({ r: priceRatio(product, bands), w: e.weight * dl });
    } else {
      N -= e.weight * dl;
      sN -= e.weight * ds;
    }
    if (reason === 'price') pricedOut.push(priceRatio(product, bands));

    const x: Record<string, number> = {};
    const styleScale = 1 / Math.sqrt(Math.max(1, product.styleTags.length));
    // Recent actions count more: long-term decay plus a boost for right now.
    const sampleWeight = Math.abs(e.weight) * ((1 - options.shortBlend) * dl + options.shortBlend * ds);
    samples.push({ x, y: e.weight >= 0 ? 1 : 0, w: sampleWeight });

    for (const f of productFeatures(product, bands)) {
      labels[f.key] ??= f.label;
      // "Forget this": evidence from before they asked doesn't count.
      if ((forgotAt.get(f.key) ?? -1) >= e.at) continue;
      let w = e.weight;
      if (e.isSkip) {
        // "Those skips weren't about bouclé": skips stop counting against it.
        if (fine.has(f.key)) continue;
        // "What put you off? Price": blame only that aspect, a bit harder.
        if (reason) {
          if (f.kind !== REASON_KIND[reason]) continue;
          w *= 1.5;
        }
      }
      x[f.key] = f.kind === 'style' ? styleScale : 1;
      add(long, f.key, w * dl);
      add(short, f.key, w * ds);
    }
  }

  // First-launch style picks: older than any real swipe, so they fade.
  const seeds =
    resets.length > 0
      ? []
      : [...new Set((input.seedStyles ?? []).map((s) => s.toLowerCase()))].filter((s) => !forgotAt.has(`style:${s}`));
  const seedDecay = Math.pow(0.5, swipeTimes.length / options.longHalfLife);
  for (const style of seeds) {
    const key = `style:${style}`;
    labels[key] ??= style;
    add(long, key, options.seedWeight * seedDecay);
  }

  const priorMean: Record<string, number> = {};
  for (const style of seeds) priorMean[`style:${style}`] = options.seedPrior * seedDecay;
  for (const key of muted) priorMean[key] = options.mutedPrior;
  for (const key of boosted) priorMean[key] = options.boostPrior;
  const fit = fitPreferences(samples, priorMean, new Set(muted), options.priorSd);

  return {
    weights: fit.weights,
    bias: fit.bias,
    priorSd: options.priorSd,
    long,
    short,
    baseRate: (P + 1) / (P + N + 2),
    shortBaseRate: (sP + 1) / (sP + sN + 2),
    shortMass: sP + sN,
    budget: learnBudget(
      pricePoints,
      pricedOut,
      input.statedBudget && bands[input.statedBudget.subcategoryId]
        ? priceRatio(
            { priceCents: input.statedBudget.maxCents, subcategoryId: input.statedBudget.subcategoryId },
            bands,
          )
        : null,
    ),
    muted,
    boosted,
    fine: [...fine],
    keepCount,
    swipeCount: swipeTimes.length,
    positiveCount,
    seeded: seeds.length >= options.coldStartKeeps,
    labels,
    options,
  };
}

/**
 * Price ceiling, learned from what they keep. A budget stated during onboarding
 * (`stated`, same units) counts like about 3 kept pieces at that price: it sets
 * the ceiling from the very first card, then real behavior takes over.
 */
function learnBudget(points: { r: number; w: number }[], pricedOut: number[], stated: number | null): Budget | null {
  const learned = learnFromBehavior(points, pricedOut);
  if (stated === null) return learned;
  const hint = { center: stated - 0.35, ceiling: stated + 0.05, confidence: 0.8 };
  const W = points.reduce((s, p) => s + p.w, 0);
  if (!learned || W < 2.5) {
    if (!learned) return hint;
    return { ...hint, ceiling: Math.min(hint.ceiling, learned.ceiling) };
  }
  const HINT_WEIGHT = 3;
  const mix = (a: number, b: number) => (HINT_WEIGHT * a + W * b) / (HINT_WEIGHT + W);
  return {
    center: mix(hint.center, learned.center),
    ceiling: mix(hint.ceiling, learned.ceiling),
    confidence: Math.max(hint.confidence, learned.confidence),
  };
}

function learnFromBehavior(points: { r: number; w: number }[], pricedOut: number[]): Budget | null {
  const W = points.reduce((s, p) => s + p.w, 0);
  if (W >= 2.5) {
    const center = points.reduce((s, p) => s + p.r * p.w, 0) / W;
    const variance = points.reduce((s, p) => s + p.w * (p.r - center) ** 2, 0) / W;
    const sd = Math.max(0.2, Math.sqrt(variance));
    let ceiling = center + 1.2 * sd + 0.15;
    // "Too pricey" answers pull the ceiling down, but never below their usual price.
    for (const r of pricedOut) ceiling = Math.max(center + 0.05, Math.min(ceiling, r - 0.1));
    return { center, ceiling, confidence: Math.min(1, W / 6) };
  }
  if (pricedOut.length > 0) {
    const ceiling = Math.min(...pricedOut) - 0.1;
    return { center: ceiling - 0.3, ceiling, confidence: 0.5 };
  }
  return null;
}

export interface Affinity {
  /** −2..2-ish: below zero means they lean against it. */
  mean: number;
  /** Uncertainty: high for features we've barely seen. */
  sd: number;
  /** Weighted amount of evidence. */
  n: number;
}

/** How much the shopper likes one feature (log-odds), and how sure we are. */
export function affinity(model: TasteModel, key: string): Affinity {
  const w = model.weights[key];
  const n = (model.long[key]?.pos ?? 0) + (model.long[key]?.neg ?? 0);
  if (!w) return { mean: 0, sd: model.priorSd, n };
  return { mean: w.mean, sd: w.sd, n };
}

export function isColdStartModel(model: TasteModel): boolean {
  return model.positiveCount < model.options.coldStartKeeps && !model.seeded;
}

interface Sample {
  x: Record<string, number>;
  /** 1 = a positive reaction, 0 = negative. */
  y: number;
  w: number;
}

/**
 * Bayesian logistic regression, fitted per shopper (Newton's method, Laplace
 * approximation for uncertainty). Unlike adding up evidence per feature, it
 * works out WHICH features explain the keeps and skips: if every kept sofa
 * was bouclé but only some were cream, bouclé gets the credit.
 */
export function fitPreferences(
  samples: readonly Sample[],
  priorMean: Record<string, number>,
  firm: ReadonlySet<string>,
  priorSd: number,
): { weights: Record<string, FittedWeight>; bias: number } {
  const keys = new Set<string>(Object.keys(priorMean));
  for (const s of samples) for (const k of Object.keys(s.x)) keys.add(k);
  const names = [...keys].sort();
  const index = new Map(names.map((k, i) => [k, i + 1]));
  const d = names.length + 1; // slot 0 is the bias
  const mu = new Float64Array(d);
  const lambda = new Float64Array(d);
  lambda[0] = 0.05;
  for (let i = 1; i < d; i++) {
    const k = names[i - 1];
    mu[i] = priorMean[k] ?? 0;
    lambda[i] = firm.has(k) ? 4 : 1 / (priorSd * priorSd);
  }
  const rows = samples.map((s) => {
    const idx: number[] = [0];
    const val: number[] = [1];
    for (const [k, v] of Object.entries(s.x)) {
      idx.push(index.get(k)!);
      val.push(v);
    }
    return { idx, val, y: s.y, w: s.w };
  });

  const theta = Float64Array.from(mu);
  const H = new Float64Array(d * d);
  for (let iter = 0; iter < 12; iter++) {
    const g = new Float64Array(d);
    H.fill(0);
    for (let i = 0; i < d; i++) {
      g[i] = lambda[i] * (theta[i] - mu[i]);
      H[i * d + i] = lambda[i];
    }
    for (const r of rows) {
      let z = 0;
      for (let a = 0; a < r.idx.length; a++) z += theta[r.idx[a]] * r.val[a];
      const p = 1 / (1 + Math.exp(-z));
      const gr = r.w * (p - r.y);
      const hr = r.w * Math.max(p * (1 - p), 1e-6);
      for (let a = 0; a < r.idx.length; a++) {
        const ia = r.idx[a];
        g[ia] += gr * r.val[a];
        for (let b = 0; b < r.idx.length; b++) H[ia * d + r.idx[b]] += hr * r.val[a] * r.val[b];
      }
    }
    const step = solve(H, g, d);
    let size = 0;
    for (let i = 0; i < d; i++) {
      theta[i] -= step[i];
      size = Math.max(size, Math.abs(step[i]));
    }
    if (size < 1e-4) break;
  }
  const varDiag = inverseDiagonal(H, d);
  const weights: Record<string, FittedWeight> = {};
  for (let i = 1; i < d; i++) weights[names[i - 1]] = { mean: theta[i], sd: Math.sqrt(Math.max(varDiag[i], 1e-9)) };
  return { weights, bias: theta[0] };
}

/** Cholesky factor (lower) of a symmetric positive-definite matrix, in place copy. */
function cholesky(A: Float64Array, d: number): Float64Array {
  const L = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * d + j];
      for (let k = 0; k < j; k++) sum -= L[i * d + k] * L[j * d + k];
      L[i * d + j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / L[j * d + j];
    }
  }
  return L;
}

function solveWith(L: Float64Array, b: Float64Array, d: number): Float64Array {
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * d + k] * y[k];
    y[i] = s / L[i * d + i];
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < d; k++) s -= L[k * d + i] * x[k];
    x[i] = s / L[i * d + i];
  }
  return x;
}

function solve(A: Float64Array, b: Float64Array, d: number): Float64Array {
  return solveWith(cholesky(A, d), b, d);
}

function inverseDiagonal(A: Float64Array, d: number): Float64Array {
  const L = cholesky(A, d);
  const out = new Float64Array(d);
  const e = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    e.fill(0);
    e[i] = 1;
    out[i] = solveWith(L, e, d)[i];
  }
  return out;
}
