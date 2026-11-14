/**
 * Evaluation runner (pure): human labels + system embeddings → one report per system, for ONE
 * split, scored separately for structure and overall aesthetic similarity. Labels are aggregated from several raters' exports; model outputs are only ever scored,
 * never stored as labels. The CLI (scripts/vision/evaluate.ts) does the file I/O and the test lock.
 */
import { majority } from './agreement';
import { questionSplit } from './grouping';
import {
  averagePrecision,
  atThreshold,
  chooseThreshold,
  cosine,
  crossStoreRatio,
  nearest,
  retrievalReport,
  spearman,
  tripletAccuracy,
  type Embeddings,
  type LabelledTriplet,
  type RetrievalReport,
  type TripletResult,
} from './metrics';
import type { Dimension, LabelExport, Manifest, QuestionPack, SameAnswer, Split } from './schema';
import { estimate, type Estimate } from '@/recommendation/lab/metrics';

export interface EvalProduct {
  id: string;
  split: Split;
  retailerId: string;
  subcategoryId: string;
}

export interface EvalInput {
  split: Split;
  products: readonly EvalProduct[];
  packs: readonly QuestionPack[];
  exports: readonly LabelExport[];
  systems: ReadonlyMap<string, Embeddings>;
  /** Graded pooled relevance judgments (query → candidate → 0–3), already aggregated across raters. */
  judgments?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Same-design thresholds chosen on DEV, per system; applied unchanged on test. */
  thresholds?: Readonly<Record<string, number>>;
  k?: number;
  seed?: number;
}

export interface SystemReport {
  /** Triplet accuracy per dimension (structure / overall aesthetic), against that dimension's human majority. */
  triplets: Record<Dimension, TripletResult>;
  /**
   * Accuracy on triplets where people's structure and overall-look majorities DISAGREE — the items
   * that show which notion of similarity a model actually follows. One embedding can't win both.
   */
  divergent: Record<Dimension, TripletResult>;
  /** Spearman between mean human 1–5 rating and cosine similarity, per dimension. */
  pairSpearman: Record<Dimension, number>;
  pairs: Record<Dimension, number>;
  sameDesign: { ap: number; positives: number; negatives: number; threshold: number | null; atThreshold: { precision: number; recall: number } | null };
  /** Pooled retrieval at depth 5 (for P@5) and 10 (for nDCG@10, judged@10, pooled recall@10). */
  retrieval: { at5: RetrievalReport; at10: RetrievalReport } | null;
  /** Mean cross-store ratio (≈1 none, <1 the model prefers the query's own store more than people do). */
  crossStore: Estimate | null;
}

export interface EvalReport {
  split: Split;
  labels: {
    triplets: Record<Dimension, number>;
    ambiguousTriplets: Record<Dimension, number>;
    /** Triplets with a clear majority on both dimensions that point to different options. */
    divergentTriplets: number;
    pairs: Record<Dimension, number>;
    same: number;
    excludedMixedSplit: number;
    raters: number;
  };
  systems: Record<string, SystemReport>;
}

const SAME_DESIGN: SameAnswer[] = ['same-photo', 'same-design-diff-colour', 'same-design-diff-photo'];

/** Median of graded answers, rounded down (ties don't inflate relevance). Null when < 2 answers. */
export function aggregateGrade(grades: readonly (number | null)[]): number | null {
  const g = grades.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (g.length < 2) return null;
  return g.length % 2 ? g[g.length >> 1]! : Math.floor((g[g.length / 2 - 1]! + g[g.length / 2]!) / 2);
}

/** Aggregates relevance questions from rater exports into pooled judgments. Unaggregatable pairs stay UNJUDGED. */
export function judgmentsFromExports(packs: readonly QuestionPack[], exports: readonly LabelExport[]): Map<string, Map<string, number>> {
  const qs = new Map(packs.flatMap((p) => p.questions).map((q) => [q.id, q]));
  const votes = new Map<string, (number | null)[]>();
  for (const e of exports) for (const a of e.answers) if (a.value.kind === 'relevance') {
    if (!votes.has(a.questionId)) votes.set(a.questionId, []);
    votes.get(a.questionId)!.push(a.value.grade);
  }
  const out = new Map<string, Map<string, number>>();
  for (const [qid, v] of votes) {
    const q = qs.get(qid);
    if (!q || q.kind !== 'relevance') continue;
    const g = aggregateGrade(v);
    if (g === null) continue;
    if (!out.has(q.query.productId)) out.set(q.query.productId, new Map());
    out.get(q.query.productId)!.set(q.candidate.productId, g);
  }
  return out;
}

export function evaluate(input: EvalInput): EvalReport {
  const k = input.k ?? 10; // depth used for the cross-store check
  const seed = input.seed ?? 17;
  const splitOf = new Map(input.products.map((p) => [p.id, p.split]));
  const byQ = new Map<string, LabelExport['answers'][number][]>();
  for (const e of input.exports) for (const a of e.answers) {
    if (!byQ.has(a.questionId)) byQ.set(a.questionId, []);
    byQ.get(a.questionId)!.push(a);
  }
  const triplets: Record<Dimension, LabelledTriplet[]> = { structure: [], aesthetic: [] };
  const pairs: Record<Dimension, { a: string; b: string; rating: number }[]> = { structure: [], aesthetic: [] };
  const same: { a: string; b: string; positive: boolean }[] = [];
  let excludedMixedSplit = 0;
  for (const pack of input.packs) for (const q of pack.questions) {
    const ans = byQ.get(q.id) ?? [];
    if (!ans.length || q.kind === 'attributes' || q.kind === 'relevance') continue;
    const ids = q.kind === 'triplet' ? [q.anchor.productId, q.b.productId, q.c.productId] : [q.a.productId, q.b.productId];
    const side = questionSplit(ids, splitOf);
    if (side === null) {
      excludedMixedSplit++;
      continue;
    }
    if (side !== input.split) continue;
    if (q.kind === 'triplet') {
      for (const d of q.ask) {
        const m = majority(ans.map((a) => (a.value.kind === 'triplet' ? (a.value[d] ?? 'cant-tell') : 'cant-tell')));
        triplets[d].push({ id: q.id, anchor: ids[0]!, b: ids[1]!, c: ids[2]!, human: m.label as LabelledTriplet['human'], stratum: q.stratum });
      }
    } else if (q.kind === 'pair') {
      for (const d of q.ask) {
        const r = ans.flatMap((a) => (a.value.kind === 'pair' && a.value[d] != null ? [a.value[d]!] : []));
        if (r.length >= 2) pairs[d].push({ a: ids[0]!, b: ids[1]!, rating: r.reduce((s, x) => s + x, 0) / r.length });
      }
    } else if (q.kind === 'same') {
      const m = majority(ans.map((a) => (a.value.kind === 'same' ? a.value.choice : 'cant-tell')));
      if (m.label !== 'ambiguous') same.push({ a: ids[0]!, b: ids[1]!, positive: SAME_DESIGN.includes(m.label as SameAnswer) });
    }
  }

  // Items where both dimensions have a clear, different majority.
  const aestheticById = new Map(triplets.aesthetic.map((t) => [t.id, t.human]));
  const divergentIds = new Set(
    triplets.structure.filter((t) => t.human !== 'ambiguous' && aestheticById.has(t.id) && aestheticById.get(t.id) !== 'ambiguous' && aestheticById.get(t.id) !== t.human).map((t) => t.id),
  );
  const divergent: Record<Dimension, LabelledTriplet[]> = {
    structure: triplets.structure.filter((t) => divergentIds.has(t.id)),
    aesthetic: triplets.aesthetic.filter((t) => divergentIds.has(t.id)),
  };

  const inSplit = input.products.filter((p) => p.split === input.split);
  const storeOf = new Map(input.products.map((p) => [p.id, p.retailerId]));
  const systems: Record<string, SystemReport> = {};
  for (const [name, emb] of [...input.systems].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const scorable = (d: Dimension) => pairs[d].filter((p) => emb.has(p.a) && emb.has(p.b));
    const rho = (d: Dimension) => {
      const sc = scorable(d);
      return sc.length >= 3 ? spearman(sc.map((p) => p.rating), sc.map((p) => cosine(emb.get(p.a)!, emb.get(p.b)!))) : NaN;
    };
    const sameScores = same.filter((s) => emb.has(s.a) && emb.has(s.b)).map((s) => ({ score: cosine(emb.get(s.a)!, emb.get(s.b)!), positive: s.positive }));
    const threshold = input.split === 'dev' ? (sameScores.length ? chooseThreshold(sameScores) : null) : (input.thresholds?.[name] ?? null);
    let retrieval: SystemReport['retrieval'] = null;
    let crossStore: Estimate | null = null;
    if (input.judgments) {
      const runs = new Map<string, string[]>();
      for (const [q] of input.judgments) {
        const qp = inSplit.find((p) => p.id === q);
        if (!qp || !emb.has(q)) continue;
        const universe = inSplit.filter((p) => p.id !== q && p.subcategoryId === qp.subcategoryId).map((p) => p.id);
        runs.set(q, nearest(q, universe, emb, Math.max(k, 10)));
      }
      retrieval = { at5: retrievalReport(runs, input.judgments, { k: 5, seed }), at10: retrievalReport(runs, input.judgments, { k: 10, seed }) };
      const ratios = [...runs].map(([q, r]) => crossStoreRatio(q, r, input.judgments!.get(q)!, (id) => storeOf.get(id) ?? '', k)).filter(Number.isFinite);
      crossStore = ratios.length ? estimate(ratios, seed) : null;
    }
    systems[name] = {
      triplets: { structure: tripletAccuracy(triplets.structure, emb, seed), aesthetic: tripletAccuracy(triplets.aesthetic, emb, seed) },
      divergent: { structure: tripletAccuracy(divergent.structure, emb, seed), aesthetic: tripletAccuracy(divergent.aesthetic, emb, seed) },
      pairSpearman: { structure: rho('structure'), aesthetic: rho('aesthetic') },
      pairs: { structure: scorable('structure').length, aesthetic: scorable('aesthetic').length },
      sameDesign: {
        ap: averagePrecision(sameScores),
        positives: sameScores.filter((s) => s.positive).length,
        negatives: sameScores.filter((s) => !s.positive).length,
        threshold,
        atThreshold: threshold === null ? null : atThreshold(sameScores, threshold),
      },
      retrieval,
      crossStore,
    };
  }
  return {
    split: input.split,
    labels: {
      triplets: { structure: triplets.structure.length, aesthetic: triplets.aesthetic.length },
      ambiguousTriplets: { structure: triplets.structure.filter((t) => t.human === 'ambiguous').length, aesthetic: triplets.aesthetic.filter((t) => t.human === 'ambiguous').length },
      divergentTriplets: divergentIds.size,
      pairs: { structure: pairs.structure.length, aesthetic: pairs.aesthetic.length },
      same: same.length,
      excludedMixedSplit,
      raters: new Set(input.exports.map((e) => e.rater)).size,
    },
    systems,
  };
}

// --- Protected test split ------------------------------------------------------------------------

/**
 * Why the protected test split may not be scored against this manifest yet (empty = allowed).
 * Requires a v2+ manifest whose grouping is final: the image-hash duplicate check and the human
 * cross-retailer review must both be done, so no related designs can straddle dev and test.
 */
export function testScoringBlockers(manifest: Pick<Manifest, 'version' | 'grouping'>): string[] {
  const out: string[] = [];
  if (manifest.version < 2 || !manifest.grouping) out.push('manifest v1 has known grouping leaks; use manifest v2 or later');
  else {
    if (manifest.grouping.imageHashCheck !== 'done') out.push('image-hash duplicate check not run (needs image permissions P2/P3)');
    if (manifest.grouping.crossRetailerReview !== 'done') out.push('cross-retailer duplicate review not done');
  }
  return out;
}

export interface TestRun {
  at: string;
  manifestHash: string;
  systems: string[];
  /** Hash of the inputs (labels + embeddings) so a re-run on identical inputs is recognisable. */
  inputHash: string;
  reason: string;
  forced: boolean;
}

/**
 * The test split may be scored ONCE per (manifest, system) — after everything (model choice,
 * prompts, thresholds) has been frozen on dev. A repeat needs `force` and a written reason, and is
 * recorded, so repeated peeking is visible in the log.
 */
export function checkTestLock(
  log: readonly TestRun[],
  req: { manifestHash: string; systems: readonly string[]; force: boolean; reason: string },
): { ok: true } | { ok: false; why: string } {
  const prior = log.filter((r) => r.manifestHash === req.manifestHash && r.systems.some((s) => req.systems.includes(s)));
  if (!req.reason.trim()) return { ok: false, why: 'a test run needs --reason "<why, and what was frozen on dev>"' };
  if (prior.length && !req.force) {
    const names = [...new Set(prior.flatMap((r) => r.systems.filter((s) => req.systems.includes(s))))];
    return { ok: false, why: `test split already scored for ${names.join(', ')} (${prior.length} earlier run(s)); re-running needs --force and is recorded` };
  }
  return { ok: true };
}
