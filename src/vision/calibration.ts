/**
 * Calibration round analysis (before any real labelling). Each rater answers the same small pack;
 * from their exports we measure, per dimension (structure / overall aesthetic):
 *   - time per screen kind (single-question vs two-question screens) → workload
 *   - inter-rater agreement (Fleiss κ for triplets and same-thing checks, ordinal Krippendorff α for 1–5)
 *   - ambiguous judgments (no clear majority, or mostly "can't tell")
 *   - whether people separate the dimensions:
 *       structure picks the shape match over the colour match            (shape-vs-colour, gold)
 *       structure and overall look both ignore photography                (photo-style, gold)
 *       overall look notices a finish change on an identical design       (finish-only, gold)
 *       1–5 ratings move the right way on pairs built to pull them apart  (pair ordering)
 *       how often the two answers on one screen simply match              (copy rate; reported)
 *   - attention checks per rater
 * Nothing here is a model output, and no answer is changed by the analysis.
 */
import { fleissKappa, krippendorffAlpha, majority } from './agreement';
import { DIMENSIONS, type Answer, type Dimension, type LabelExport, type Question, type QuestionPack, type TripletChoice } from './schema';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
const p90 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]! : NaN;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Timing key of a screen: 'triplet:both', 'triplet:structure', 'pair:both', 'same', 'attributes', … */
export function screenKey(q: Question): string {
  if (q.kind === 'triplet' || q.kind === 'pair') return `${q.kind}:${q.ask.length > 1 ? 'both' : q.ask[0]}`;
  return q.kind;
}

export interface CalibrationReport {
  raters: string[];
  secondsByScreen: Record<string, { median: number; p90: number; n: number }>;
  agreement: {
    tripletKappa: Record<Dimension, number>;
    pairAlpha: Record<Dimension, number>;
    sameKappa: number;
  };
  ambiguous: { questionId: string; dimension: Dimension | 'same'; reason: string }[];
  separation: {
    /** Structure answers that chose the shape match over the colour match. */
    structureShapeOverColour: number;
    /** Overall-look answers on the same questions that chose the shape match (no right answer; reported). */
    aestheticShapeOverColour: number;
    /** Overall-look answers that chose the option keeping the anchor's finish. */
    aestheticNoticesFinish: number;
    /** Share of structure answers on finish-only questions that were "can't tell" (both options share the design). */
    structureIgnoresFinish: number;
    /** Both dimensions chose the same design over the anchor-like photo style. */
    photoIgnored: Record<Dimension, number>;
    /** Contrast pairs rated in the expected direction (structure ≥ look when only colour or finish differs; look ≥ structure when only the colour matches). */
    pairOrdering: number;
    /** On two-question screens, share where both answers were identical (high on divergent items = raters not separating). */
    copyRateDivergent: number;
  };
  goldAccuracyByRater: Record<string, number>;
  /** Plain-language checks that failed (empty = ready for the full round). */
  warnings: string[];
}

function answersById(exports: readonly LabelExport[]): Map<string, { rater: string; a: Answer }[]> {
  const m = new Map<string, { rater: string; a: Answer }[]>();
  for (const e of exports) for (const a of e.answers) {
    if (!m.has(a.questionId)) m.set(a.questionId, []);
    m.get(a.questionId)!.push({ rater: e.rater, a });
  }
  return m;
}

const tri = (a: Answer, d: Dimension): TripletChoice | undefined => (a.value.kind === 'triplet' ? a.value[d] : undefined);
const rate = (a: Answer, d: Dimension): number | null | undefined => (a.value.kind === 'pair' ? a.value[d] : undefined);

export function analyseCalibration(pack: QuestionPack, exports: readonly LabelExport[]): CalibrationReport {
  const byId = answersById(exports);
  const warnings: string[] = [];
  const secs = new Map<string, number[]>();
  const qById = new Map(pack.questions.map((q) => [q.id, q]));
  for (const e of exports) for (const a of e.answers) {
    const q = qById.get(a.questionId);
    if (!q) continue;
    const k = screenKey(q);
    if (!secs.has(k)) secs.set(k, []);
    secs.get(k)!.push(a.ms / 1000);
  }

  const tripletUnits: Record<Dimension, string[][]> = { structure: [], aesthetic: [] };
  const pairUnits: Record<Dimension, (number | null)[][]> = { structure: [], aesthetic: [] };
  const sameUnits: string[][] = [];
  const ambiguous: CalibrationReport['ambiguous'] = [];
  const sep = { sShape: [] as number[], aShape: [] as number[], aFinish: [] as number[], sFinishCT: [] as number[], photo: { structure: [] as number[], aesthetic: [] as number[] }, order: [] as number[], copy: [] as number[] };
  const gold = new Map<string, number[]>();
  const recordGold = (rater: string, ok: boolean) => {
    if (!gold.has(rater)) gold.set(rater, []);
    gold.get(rater)!.push(ok ? 1 : 0);
  };

  for (const q of pack.questions) {
    const rs = byId.get(q.id) ?? [];
    if (q.kind === 'triplet') {
      for (const d of q.ask) {
        const choices = rs.map((r) => tri(r.a, d)).filter((c): c is TripletChoice => c !== undefined);
        tripletUnits[d].push(choices.filter((c) => c !== 'cant-tell'));
        const m = majority(choices);
        if (m.label === 'ambiguous' && q.stratum !== 'gold' && !(q.stratum === 'finish-only' && d === 'structure'))
          ambiguous.push({ questionId: q.id, dimension: d, reason: m.cantTell * 2 > choices.length ? "mostly can't tell" : 'no clear majority' });
      }
      const g = q.gold ?? {};
      for (const r of rs) {
        const s = tri(r.a, 'structure');
        const a = tri(r.a, 'aesthetic');
        if (q.stratum === 'gold') {
          for (const d of q.ask) if (g[d]) recordGold(r.rater, tri(r.a, d) === g[d]);
        } else if (q.stratum === 'shape-vs-colour' && g.structure) {
          if (s && s !== 'cant-tell') sep.sShape.push(s === g.structure ? 1 : 0);
          if (a && a !== 'cant-tell') sep.aShape.push(a === g.structure ? 1 : 0);
        } else if (q.stratum === 'finish-only' && g.aesthetic) {
          if (a && a !== 'cant-tell') sep.aFinish.push(a === g.aesthetic ? 1 : 0);
          if (s) sep.sFinishCT.push(s === 'cant-tell' ? 1 : 0);
        } else if (q.stratum === 'photo-style') {
          for (const d of DIMENSIONS) {
            const c = tri(r.a, d);
            if (g[d] && c && c !== 'cant-tell') sep.photo[d].push(c === g[d] ? 1 : 0);
          }
        }
        if ((q.stratum === 'shape-vs-colour' || q.stratum === 'finish-only') && s !== undefined && a !== undefined) sep.copy.push(s === a ? 1 : 0);
      }
    } else if (q.kind === 'pair') {
      for (const d of q.ask) pairUnits[d].push(rs.map((r) => rate(r.a, d) ?? null));
      if (q.ask.length === 2) {
        for (const r of rs) {
          const s = rate(r.a, 'structure');
          const a = rate(r.a, 'aesthetic');
          if (s == null || a == null) continue;
          // Same shape (other colour or finish): structure should be rated at least as high as the overall look.
          if (q.stratum === 'same-shape-diff-colour' || q.stratum === 'same-design-diff-finish') sep.order.push(s >= a ? 1 : 0);
          // Same colour, other shape: the overall look should be rated at least as high as structure.
          if (q.stratum === 'same-colour-diff-shape') sep.order.push(a >= s ? 1 : 0);
        }
      }
    } else if (q.kind === 'same') {
      const choices = rs.map((r) => (r.a.value.kind === 'same' ? r.a.value.choice : 'cant-tell'));
      sameUnits.push(choices.filter((c) => c !== 'cant-tell'));
      const m = majority(choices);
      if (m.label === 'ambiguous' && q.stratum !== 'gold') ambiguous.push({ questionId: q.id, dimension: 'same', reason: 'no clear majority' });
      if (q.gold && q.stratum === 'gold') for (const r of rs) recordGold(r.rater, r.a.value.kind === 'same' && r.a.value.choice === q.gold);
    }
  }

  const report: CalibrationReport = {
    raters: exports.map((e) => e.rater),
    secondsByScreen: Object.fromEntries([...secs].sort().map(([k, v]) => [k, { median: median(v), p90: p90(v), n: v.length }])),
    agreement: {
      tripletKappa: { structure: fleissKappa(tripletUnits.structure), aesthetic: fleissKappa(tripletUnits.aesthetic) },
      pairAlpha: { structure: krippendorffAlpha(pairUnits.structure, 'ordinal'), aesthetic: krippendorffAlpha(pairUnits.aesthetic, 'ordinal') },
      sameKappa: fleissKappa(sameUnits),
    },
    ambiguous,
    separation: {
      structureShapeOverColour: mean(sep.sShape),
      aestheticShapeOverColour: mean(sep.aShape),
      aestheticNoticesFinish: mean(sep.aFinish),
      structureIgnoresFinish: mean(sep.sFinishCT),
      photoIgnored: { structure: mean(sep.photo.structure), aesthetic: mean(sep.photo.aesthetic) },
      pairOrdering: mean(sep.order),
      copyRateDivergent: mean(sep.copy),
    },
    goldAccuracyByRater: Object.fromEntries([...gold].map(([r, v]) => [r, mean(v)])),
    warnings,
  };
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const s = report.separation;
  if (exports.length < 3) warnings.push(`only ${exports.length} rater(s); at least 3 are needed for agreement`);
  for (const d of DIMENSIONS) {
    const k = report.agreement.tripletKappa[d];
    if (k < 0.4) warnings.push(`${d} triplet agreement κ=${k.toFixed(2)} is low (< 0.40): revise guidelines or questions`);
    const al = report.agreement.pairAlpha[d];
    if (al < 0.6) warnings.push(`${d} 1–5 rating agreement α=${al.toFixed(2)} is low (< 0.60): ratings reported, not used as a gate`);
  }
  if (s.structureShapeOverColour < 0.8) warnings.push(`structure answers followed colour instead of shape ${pct(1 - s.structureShapeOverColour)} of the time (needs ≥ 80% shape)`);
  if (s.aestheticNoticesFinish < 0.8) warnings.push(`overall-look answers missed a finish change ${pct(1 - s.aestheticNoticesFinish)} of the time (needs ≥ 80% noticed)`);
  for (const d of DIMENSIONS) if (s.photoIgnored[d] < 0.8) warnings.push(`${d} answers followed the photography over the product ${pct(1 - s.photoIgnored[d])} of the time (needs ≥ 80%)`);
  if (s.pairOrdering < 0.7) warnings.push(`1–5 ratings moved the expected way on only ${pct(s.pairOrdering)} of the contrast pairs (needs ≥ 70%)`);
  if (s.copyRateDivergent > 0.9) warnings.push(`on questions built to separate the two, both answers matched ${pct(s.copyRateDivergent)} of the time: raters may not be separating structure from overall look`);
  for (const [r, acc] of Object.entries(report.goldAccuracyByRater)) if (acc < 0.9) warnings.push(`rater ${r} missed ${pct(1 - acc)} of attention checks`);
  // A majority needs 2+ votes, so with a single rater every judgment would look "ambiguous": don't report that.
  if (exports.length < 2) report.ambiguous = [];
  const judgments = pack.questions.reduce((n, q) => n + (q.kind === 'triplet' || q.kind === 'pair' ? q.ask.length : 1), 0);
  if (report.ambiguous.length / Math.max(1, judgments) > 0.2) warnings.push(`${report.ambiguous.length} of ${judgments} judgments ambiguous (> 20%)`);
  return report;
}

/**
 * Planned screens per rater for the full 200-product round. Every triplet and pair screen asks
 * BOTH dimensions (one look at the pictures, two answers) — the calibration measures what that
 * costs compared with a single question.
 */
export const FULL_ROUND_SCREENS: Record<string, number> = {
  'triplet:both': 300,
  'pair:both': 250,
  same: 80,
  attributes: 200,
  // relevance: sized from the pool in Stage 2
};

/**
 * Minutes per rater, from calibration medians plus 15% for breaks and re-reading, split into
 * sittings of at most `sittingMinutes`. Kinds with no measured time are listed in `unmeasured`.
 */
export function workload(
  report: CalibrationReport,
  screens: Readonly<Record<string, number>> = FULL_ROUND_SCREENS,
  sittingMinutes = 45,
): { minutesPerRater: number; sittings: number; byKind: Record<string, number>; unmeasured: string[] } {
  const byKind: Record<string, number> = {};
  const unmeasured: string[] = [];
  let total = 0;
  for (const [kind, n] of Object.entries(screens)) {
    if (!n) continue;
    const s = report.secondsByScreen[kind]?.median;
    if (!Number.isFinite(s)) {
      unmeasured.push(kind);
      continue;
    }
    const m = ((s! * n) / 60) * 1.15;
    byKind[kind] = Math.round(m);
    total += m;
  }
  return { minutesPerRater: Math.round(total), sittings: Math.max(1, Math.ceil(total / sittingMinutes)), byKind, unmeasured };
}

/** How much a two-question screen costs relative to a one-question screen of the same kind (NaN if not measured). */
export function dualCost(report: CalibrationReport, kind: 'triplet' | 'pair'): number {
  const both = report.secondsByScreen[`${kind}:both`]?.median;
  const singles = DIMENSIONS.map((d) => report.secondsByScreen[`${kind}:${d}`]?.median).filter((x): x is number => Number.isFinite(x));
  if (!Number.isFinite(both) || !singles.length) return NaN;
  return both! / mean(singles);
}
