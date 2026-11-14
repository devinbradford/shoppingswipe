/**
 * Visual-similarity evaluation metrics (pure, deterministic). Embeddings are plain number arrays
 * keyed by product id; labels come only from human raters (see agreement.ts).
 *
 * Retrieval is evaluated against POOLED human judgments (see pooling.ts). A candidate nobody
 * judged is never assumed irrelevant. Each ranked-list metric reports:
 *   - judged@k   share of the system's top k that people judged (coverage)
 *   - lower      unjudged counted as not relevant (pessimistic)
 *   - upper      unjudged counted as relevant (optimistic)
 *   - condensed  unjudged removed from the list before scoring (Sakai's condensed lists)
 * Recall is only "pooled recall": relevant items found ÷ relevant items people found in the pool,
 * never presented as exhaustive.
 */
import { estimate, type Estimate } from '@/recommendation/lab/metrics';

export type Embeddings = ReadonlyMap<string, readonly number[]>;

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Top-k most similar ids to `query` among `universe` (query excluded), ties broken by id. */
export function nearest(query: string, universe: readonly string[], emb: Embeddings, k: number): string[] {
  const q = emb.get(query);
  if (!q) return [];
  return universe
    .filter((id) => id !== query && emb.has(id))
    .map((id) => ({ id, s: cosine(q, emb.get(id)!) }))
    .sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1))
    .slice(0, k)
    .map((x) => x.id);
}

// --- Triplets ---------------------------------------------------------------------------------

export interface LabelledTriplet {
  id: string;
  anchor: string;
  b: string;
  c: string;
  /** Human majority ('ambiguous' items are excluded and counted). */
  human: 'b' | 'c' | 'ambiguous';
  stratum: string;
}

export interface TripletResult {
  accuracy: Estimate;
  /** Questions the model couldn't score (missing embedding) or people found ambiguous. */
  excluded: { ambiguous: number; missing: number };
  byStratum: Record<string, Estimate>;
}

export function tripletAccuracy(triplets: readonly LabelledTriplet[], emb: Embeddings, seed = 11): TripletResult {
  const hits: number[] = [];
  const byStratum = new Map<string, number[]>();
  let ambiguous = 0;
  let missing = 0;
  for (const t of triplets) {
    if (t.human === 'ambiguous') {
      ambiguous++;
      continue;
    }
    const a = emb.get(t.anchor);
    const b = emb.get(t.b);
    const c = emb.get(t.c);
    if (!a || !b || !c) {
      missing++;
      continue;
    }
    const choice = cosine(a, b) >= cosine(a, c) ? 'b' : 'c';
    const hit = choice === t.human ? 1 : 0;
    hits.push(hit);
    if (!byStratum.has(t.stratum)) byStratum.set(t.stratum, []);
    byStratum.get(t.stratum)!.push(hit);
  }
  return {
    accuracy: estimate(hits, seed),
    excluded: { ambiguous, missing },
    byStratum: Object.fromEntries([...byStratum].map(([k, v]) => [k, estimate(v, seed)])),
  };
}

// --- Rating correlation ---------------------------------------------------------------------------

function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.x === order[i]!.x) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]!.i] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation (average ranks for ties). */
export function spearman(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return NaN;
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy);
}

// --- Retrieval over pooled judgments ---------------------------------------------------------------

/** Per query: candidate id → graded relevance from people (0 = not alike … 3 = same design / very alike). */
export type Judgments = ReadonlyMap<string, ReadonlyMap<string, number>>;

export interface Bounded {
  lower: number;
  upper: number;
  condensed: number;
}

export interface RankedListScore {
  query: string;
  judgedAtK: number;
  precision: Bounded;
  ndcg: Bounded;
  /** Relevant items in the top k ÷ relevant items people found anywhere in the pool. NaN when the pool has none. */
  pooledRecall: number;
}

const gain = (grade: number) => 2 ** grade - 1;
const dcg = (grades: readonly number[]) => grades.reduce((s, g, i) => s + gain(g) / Math.log2(i + 2), 0);

/**
 * Scores one ranked list against pooled judgments. `relevantFrom` = grade at which an item counts
 * as relevant for precision/recall (default 2).
 */
export function scoreRankedList(
  query: string,
  ranked: readonly string[],
  judged: ReadonlyMap<string, number>,
  k: number,
  relevantFrom = 2,
): RankedListScore {
  const top = ranked.slice(0, k);
  const isJudged = (id: string) => judged.has(id);
  const nJudged = top.filter(isJudged).length;
  const relevant = (id: string) => (judged.get(id) ?? -1) >= relevantFrom;
  const relInTop = top.filter(relevant).length;
  const unjudged = top.length - nJudged;
  const condensedTop = ranked.filter(isJudged).slice(0, k);

  const allGrades = [...judged.values()].sort((a, b) => b - a);
  const ideal = dcg(allGrades.slice(0, k));
  const gradesLower = top.map((id) => judged.get(id) ?? 0);
  const maxGrade = allGrades[0] ?? 0;
  const gradesUpper = top.map((id) => judged.get(id) ?? Math.max(maxGrade, relevantFrom));
  const idealUpper = dcg([...gradesUpper].sort((a, b) => b - a));
  const poolRelevant = [...judged].filter(([, g]) => g >= relevantFrom).length;

  return {
    query,
    judgedAtK: top.length ? nJudged / top.length : NaN,
    precision: {
      lower: k ? relInTop / k : NaN,
      upper: k ? (relInTop + unjudged) / k : NaN,
      condensed: condensedTop.length ? condensedTop.filter(relevant).length / Math.min(k, condensedTop.length) : NaN,
    },
    ndcg: {
      lower: ideal > 0 ? dcg(gradesLower) / ideal : NaN,
      upper: Math.max(ideal, idealUpper) > 0 ? Math.min(1, dcg(gradesUpper) / Math.max(ideal, idealUpper)) : NaN,
      condensed: ideal > 0 ? dcg(condensedTop.map((id) => judged.get(id)!)) / ideal : NaN,
    },
    pooledRecall: poolRelevant ? relInTop / poolRelevant : NaN,
  };
}

export interface RetrievalReport {
  queries: number;
  /** Mean share of the system's top k that people judged. Results are trustworthy only when this is high. */
  judgedAtK: Estimate;
  precisionLower: Estimate;
  precisionUpper: Estimate;
  precisionCondensed: Estimate;
  ndcgLower: Estimate;
  ndcgCondensed: Estimate;
  pooledRecall: Estimate;
  /** True when coverage is too low to report the condensed numbers as results. */
  lowCoverage: boolean;
}

export function retrievalReport(
  runs: ReadonlyMap<string, readonly string[]>,
  judgments: Judgments,
  { k, relevantFrom = 2, minCoverage = 0.9, seed = 13 }: { k: number; relevantFrom?: number; minCoverage?: number; seed?: number },
): RetrievalReport {
  const scores = [...runs]
    .filter(([q]) => judgments.has(q))
    .map(([q, ranked]) => scoreRankedList(q, ranked, judgments.get(q)!, k, relevantFrom));
  const pick = (f: (s: RankedListScore) => number) => estimate(scores.map(f), seed);
  const judgedAtK = pick((s) => s.judgedAtK);
  return {
    queries: scores.length,
    judgedAtK,
    precisionLower: pick((s) => s.precision.lower),
    precisionUpper: pick((s) => s.precision.upper),
    precisionCondensed: pick((s) => s.precision.condensed),
    ndcgLower: pick((s) => s.ndcg.lower),
    ndcgCondensed: pick((s) => s.ndcg.condensed),
    pooledRecall: pick((s) => s.pooledRecall),
    lowCoverage: !(judgedAtK.mean >= minCoverage),
  };
}

// --- Same-design / near-duplicate detection ------------------------------------------------------------

/** Average precision of a score ranking against binary labels (area under the precision-recall curve). */
export function averagePrecision(items: readonly { score: number; positive: boolean }[]): number {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const positives = sorted.filter((x) => x.positive).length;
  if (!positives) return NaN;
  let hits = 0;
  let sum = 0;
  sorted.forEach((x, i) => {
    if (x.positive) {
      hits++;
      sum += hits / (i + 1);
    }
  });
  return sum / positives;
}

/** Precision and recall at a cosine threshold chosen on the development set. */
export function atThreshold(items: readonly { score: number; positive: boolean }[], threshold: number) {
  const predicted = items.filter((x) => x.score >= threshold);
  const tp = predicted.filter((x) => x.positive).length;
  const positives = items.filter((x) => x.positive).length;
  return { precision: predicted.length ? tp / predicted.length : NaN, recall: positives ? tp / positives : NaN };
}

/** Best F1 threshold on DEV data (then frozen and applied unchanged to test). */
export function chooseThreshold(items: readonly { score: number; positive: boolean }[]): number {
  let best = 1;
  let bestF1 = -1;
  for (const t of [...new Set(items.map((x) => x.score))].sort((a, b) => a - b)) {
    const { precision, recall } = atThreshold(items, t);
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    if (f1 > bestF1) {
      bestF1 = f1;
      best = t;
    }
  }
  return best;
}

// --- Cross-store discovery --------------------------------------------------------------------------------

/**
 * Store shortcut check, per query: share of OTHER-store products among the model's top k, divided
 * by the same share among the products people judged relevant. ~1 = no store bias; < 1 = the model
 * prefers the query's own store more than people do. NaN when people found no relevant items.
 */
export function crossStoreRatio(
  query: string,
  ranked: readonly string[],
  judged: ReadonlyMap<string, number>,
  storeOf: (id: string) => string,
  k: number,
  relevantFrom = 2,
): number {
  const own = storeOf(query);
  const top = ranked.slice(0, k);
  const modelOther = top.length ? top.filter((id) => storeOf(id) !== own).length / top.length : NaN;
  const rel = [...judged].filter(([, g]) => g >= relevantFrom).map(([id]) => id);
  if (!rel.length) return NaN;
  const humanOther = rel.filter((id) => storeOf(id) !== own).length / rel.length;
  if (humanOther === 0) return NaN;
  return modelOther / humanOther;
}
