/**
 * Calibration round analysis (before any real labelling). Each rater answers the same ~25
 * questions; from their exports we measure:
 *   - time per question kind (median and 90th percentile)
 *   - inter-rater agreement (Fleiss κ for triplets and same-thing checks, Krippendorff α ordinal for 1–5 ratings)
 *   - ambiguous questions (no clear majority, or mostly "can't tell")
 *   - design vs colour / photography: on "trap" triplets the design match and the colour (or photo
 *     style) match point opposite ways; trapAccuracy = share choosing the design
 *   - gold accuracy per rater (attention checks with an objectively right answer)
 * and turn the measured times into a workload recommendation for the full labelling.
 */
import { fleissKappa, krippendorffAlpha, majority } from './agreement';
import type { Answer, LabelExport, Question, QuestionPack } from './schema';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};
const p90 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))]! : NaN;
};

export interface CalibrationReport {
  raters: string[];
  secondsByKind: Record<string, { median: number; p90: number; n: number }>;
  agreement: { tripletKappa: number; sameKappa: number; pairAlpha: number };
  ambiguous: { questionId: string; kind: string; reason: string }[];
  trapAccuracy: { colour: number; photo: number };
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

const tripletChoice = (a: Answer) => (a.value.kind === 'triplet' ? a.value.choice : null);

export function analyseCalibration(pack: QuestionPack, exports: readonly LabelExport[]): CalibrationReport {
  const byId = answersById(exports);
  const warnings: string[] = [];
  const secs = new Map<string, number[]>();
  for (const e of exports) for (const a of e.answers) {
    const q = pack.questions.find((x) => x.id === a.questionId);
    if (!q) continue;
    if (!secs.has(q.kind)) secs.set(q.kind, []);
    secs.get(q.kind)!.push(a.ms / 1000);
  }

  const tripletUnits: string[][] = [];
  const sameUnits: string[][] = [];
  const pairUnits: (number | null)[][] = [];
  const ambiguous: CalibrationReport['ambiguous'] = [];
  const traps = { colour: [] as number[], photo: [] as number[] };
  const gold = new Map<string, number[]>();

  for (const q of pack.questions) {
    const rs = byId.get(q.id) ?? [];
    if (q.kind === 'triplet') {
      const choices = rs.map((r) => tripletChoice(r.a)!).filter((c) => c !== null);
      tripletUnits.push(choices.filter((c) => c !== 'cant-tell'));
      const m = majority(choices);
      if (m.label === 'ambiguous' && q.stratum !== 'gold') ambiguous.push({ questionId: q.id, kind: q.kind, reason: m.cantTell * 2 > choices.length ? "mostly can't tell" : 'no clear majority' });
      if (q.gold && (q.stratum === 'colour-trap' || q.stratum === 'photo-trap')) {
        for (const c of choices) if (c !== 'cant-tell') traps[q.stratum === 'colour-trap' ? 'colour' : 'photo'].push(c === q.gold ? 1 : 0);
      }
      if (q.gold && q.stratum === 'gold') for (const r of rs) recordGold(gold, r.rater, tripletChoice(r.a) === q.gold);
    } else if (q.kind === 'same') {
      const choices = rs.map((r) => (r.a.value.kind === 'same' ? r.a.value.choice : 'cant-tell'));
      sameUnits.push(choices.filter((c) => c !== 'cant-tell'));
      const m = majority(choices);
      if (m.label === 'ambiguous' && q.stratum !== 'gold') ambiguous.push({ questionId: q.id, kind: q.kind, reason: 'no clear majority' });
      if (q.gold && q.stratum === 'gold') for (const r of rs) recordGold(gold, r.rater, r.a.value.kind === 'same' && r.a.value.choice === q.gold);
    } else if (q.kind === 'pair') {
      pairUnits.push(rs.map((r) => (r.a.value.kind === 'pair' ? r.a.value.rating : null)));
    }
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const report: CalibrationReport = {
    raters: exports.map((e) => e.rater),
    secondsByKind: Object.fromEntries([...secs].map(([k, v]) => [k, { median: median(v), p90: p90(v), n: v.length }])),
    agreement: {
      tripletKappa: fleissKappa(tripletUnits),
      sameKappa: fleissKappa(sameUnits),
      pairAlpha: krippendorffAlpha(pairUnits, 'ordinal'),
    },
    ambiguous,
    trapAccuracy: { colour: mean(traps.colour), photo: mean(traps.photo) },
    goldAccuracyByRater: Object.fromEntries([...gold].map(([r, v]) => [r, mean(v)])),
    warnings,
  };
  if (exports.length < 3) warnings.push(`only ${exports.length} rater(s); at least 3 are needed for agreement`);
  if (report.agreement.tripletKappa < 0.4) warnings.push(`triplet agreement κ=${report.agreement.tripletKappa.toFixed(2)} is low (< 0.40): revise guidelines or questions`);
  if (report.agreement.pairAlpha < 0.6) warnings.push(`1–5 rating agreement α=${report.agreement.pairAlpha.toFixed(2)} is low (< 0.60)`);
  if (report.trapAccuracy.colour < 0.8) warnings.push(`raters follow colour over design on ${Math.round((1 - report.trapAccuracy.colour) * 100)}% of colour traps`);
  if (report.trapAccuracy.photo < 0.8) warnings.push(`raters follow photo style over design on ${Math.round((1 - report.trapAccuracy.photo) * 100)}% of photo traps`);
  for (const [r, acc] of Object.entries(report.goldAccuracyByRater)) if (acc < 0.9) warnings.push(`rater ${r} missed ${Math.round((1 - acc) * 100)}% of attention checks`);
  if (ambiguous.length / Math.max(1, pack.questions.length) > 0.2) warnings.push(`${ambiguous.length} of ${pack.questions.length} questions ambiguous (> 20%)`);
  return report;
}

function recordGold(m: Map<string, number[]>, rater: string, ok: boolean) {
  if (!m.has(rater)) m.set(rater, []);
  m.get(rater)!.push(ok ? 1 : 0);
}

/** Planned volumes for the full 200-product round (per rater). */
export const FULL_ROUND_VOLUMES: Record<Question['kind'], number> = {
  triplet: 300,
  pair: 300,
  same: 80,
  attributes: 200,
  relevance: 0, // set from the pool size once systems are pooled (Stage 2)
};

/**
 * Minutes per rater for the full round, from calibration medians plus 15% for breaks and
 * re-reading, split into sittings of at most `sittingMinutes`.
 */
export function workload(
  report: CalibrationReport,
  volumes: Partial<Record<Question['kind'], number>> = FULL_ROUND_VOLUMES,
  sittingMinutes = 45,
): { minutesPerRater: number; sittings: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const [kind, n] of Object.entries(volumes)) {
    const s = report.secondsByKind[kind]?.median;
    if (!n || !Number.isFinite(s)) continue;
    const m = ((s! * n) / 60) * 1.15;
    byKind[kind] = Math.round(m);
    total += m;
  }
  return { minutesPerRater: Math.round(total), sittings: Math.max(1, Math.ceil(total / sittingMinutes)), byKind };
}
