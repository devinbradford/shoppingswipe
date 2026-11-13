/**
 * Engine Lab metrics. Every metric is computed per session (one shopper, one policy, one catalog),
 * then averaged across sessions with a seeded bootstrap 95% confidence interval. Comparisons
 * between policies are PAIRED: the same shopper on the same catalog under each policy.
 *
 * Definitions (all on simulated shoppers; none is evidence about real people):
 *  relevance@a-b   mean utility percentile of cards a..b (0.5 = what random order gives, 1 = best possible)
 *  firstLove       swipe number of the first "love" (shopper's top 2% of the eligible type);
 *                  censored at session length + 1 when none was shown
 *  loveFound       share of sessions showing at least one love
 *  loves@20        loves among the first 20 cards
 *  gemFound        share of sessions (where one exists) showing a hidden gem: a love from a
 *                  long-tail family or store (< 5% of the catalog)
 *  families@20     distinct ground-truth design families in the first 20 cards
 *  styles@20       distinct style TAGS in the first 20 cards (what the shopper is told)
 *  retailers@20    distinct stores in the first 20 cards
 *  bigStore@20     share of the first 20 cards from the catalog's biggest store (compare with its
 *                  catalog share: higher = small stores are crowded out)
 *  nearDup         share of cards whose design (variant group) appeared in the previous 5 cards
 *  keep@a-b        simulated keep rate (SYNTHETIC; not a satisfaction or conversion rate)
 *  recovery        swipe at which the rolling-10 relevance first reaches 0.7 (censored)
 *  overBudget      share of cards above a strict budget (budget scenario only)
 *  ineligible      cards that were inactive, of another type, or already swiped (must be 0)
 *  dupExposure     cards shown twice in one session (must be 0)
 *  exhausted       sessions where the deck ran dry while eligible products remained (must be 0)
 */
import { createRng } from '../random';
import type { SessionLog } from './session';

export interface SessionMetrics {
  [name: string]: number;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const window = (log: SessionLog, from: number, to: number) => log.exposures.filter((e) => e.swipe >= from - 1 && e.swipe <= to - 1);

export function sessionMetrics(log: SessionLog, swipesPerSession: number): SessionMetrics {
  const ex = log.exposures;
  const first20 = window(log, 1, 20);
  const rel = (a: number, b: number) => mean(window(log, a, b).map((e) => e.percentile));
  const keep = (a: number, b: number) => mean(window(log, a, b).map((e) => (e.kept ? 1 : 0)));
  const firstLove = ex.find((e) => e.love);
  const storeCounts = new Map<string, number>();
  for (const e of first20) storeCounts.set(e.retailerId, (storeCounts.get(e.retailerId) ?? 0) + 1);
  let nearDup = 0;
  ex.forEach((e, i) => {
    if (ex.slice(Math.max(0, i - 5), i).some((p) => p.designId === e.designId)) nearDup++;
  });
  let recovery = swipesPerSession + 1;
  for (let i = 9; i < ex.length; i++) {
    if (mean(ex.slice(i - 9, i + 1).map((e) => e.percentile)) >= 0.7) {
      recovery = ex[i]!.swipe + 1;
      break;
    }
  }
  const ids = ex.map((e) => e.productId);
  return {
    'relevance@1-10': rel(1, 10),
    'relevance@11-20': rel(11, 20),
    'relevance@21-40': rel(21, 40),
    'relevance@41-60': rel(41, 60),
    'relevance@1-20': rel(1, 20),
    'relevance@31-40': rel(31, 40),
    firstLove: firstLove ? firstLove.swipe + 1 : swipesPerSession + 1,
    loveFound: firstLove ? 1 : 0,
    'loves@20': first20.filter((e) => e.love).length,
    gemFound: log.gemsAvailable ? (ex.some((e) => e.gem) ? 1 : 0) : NaN,
    'families@20': new Set(first20.map((e) => e.family)).size,
    'styles@20': new Set(first20.flatMap((e) => e.styleTags)).size,
    'retailers@20': storeCounts.size,
    nearDup: ex.length ? nearDup / ex.length : NaN,
    'keep@1-10': keep(1, 10),
    'keep@41-60': keep(41, 60),
    recovery,
    overBudget: mean(ex.map((e) => (e.overBudget ? 1 : 0))),
    ineligible: ex.filter((e) => e.ineligible).length,
    dupExposure: ids.length - new Set(ids).size,
    exhausted: log.exhausted ? 1 : 0,
    firstDeckGemRank: log.firstDeckGemRank,
  };
}

/** Share of the first 20 cards from the catalog's biggest store (needs the catalog's shares). */
export function bigStoreShare(log: SessionLog, retailerShare: ReadonlyMap<string, number>): number {
  const biggest = [...retailerShare].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const first20 = log.exposures.filter((e) => e.swipe < 20);
  return first20.length ? first20.filter((e) => e.retailerId === biggest).length / first20.length : NaN;
}

export interface Estimate {
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

/** Mean with a seeded percentile-bootstrap 95% interval (NaN values are left out). */
export function estimate(values: readonly number[], seed = 1): Estimate {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
  const m = mean(xs);
  if (xs.length === 1) return { mean: m, lo: m, hi: m, n: 1 };
  const rng = createRng(seed);
  const means: number[] = [];
  for (let b = 0; b < 1000; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rng() * xs.length)]!;
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  return { mean: m, lo: means[25]!, hi: means[974]!, n: xs.length };
}

/** Paired difference a − b over sessions with the same key (shopper × catalog). */
export function pairedDifference(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, seed = 2): Estimate {
  const diffs: number[] = [];
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb !== undefined && Number.isFinite(va) && Number.isFinite(vb)) diffs.push(va - vb);
  }
  return estimate(diffs, seed);
}

export function median(values: readonly number[]): number {
  const xs = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

export function quantile(values: readonly number[], q: number): number {
  const xs = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return NaN;
  return xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
}
