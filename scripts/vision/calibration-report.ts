/// <reference types="node" />
/**
 * Calibration round analysis: time per screen (one question vs two), agreement per dimension,
 * ambiguous judgments, whether raters separate structure from overall look (shape vs colour,
 * finish, photography, contrast pairs), attention checks, and the workload for the full round.
 *
 *   npm run vision:calibration -- --labels <folder of rater exports> [--pack tools/annotate/packs/calibration-v2.json]
 *   npm run vision:calibration -- --tool-check
 *       Runs the analysis on SCRIPTED answer sheets to check this code. Not people, not
 *       observations: never report these numbers as calibration results.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyseCalibration, dualCost, FULL_ROUND_SCREENS, workload } from '../../src/vision/calibration';
import { makeCalibrationPack } from '../../src/vision/fixtureArt';
import { DIMENSIONS, LABELS_VERSION, validateExport, type Answer, type AnswerValue, type LabelExport, type QuestionPack } from '../../src/vision/schema';

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

/** Scripted sheets: one follows the construction, one judges everything by colour, one picks "b". */
function scripted(pack: QuestionPack): LabelExport[] {
  const sheet = (rater: string, pick: (q: QuestionPack['questions'][number]) => AnswerValue): LabelExport => ({
    version: LABELS_VERSION,
    packId: pack.id,
    rater,
    startedAt: '-',
    finishedAt: '-',
    answers: pack.questions.map((q, order): Answer => ({ questionId: q.id, value: pick(q), confidence: 2, ms: q.kind === 'triplet' || q.kind === 'pair' ? 4000 * q.ask.length : 9000, order, swapped: false, at: '-' })),
  });
  const other = (x: 'b' | 'c') => (x === 'b' ? 'c' : 'b');
  const follow = (colourLed: boolean, fixed?: 'b') => (q: QuestionPack['questions'][number]): AnswerValue => {
    if (q.kind === 'triplet') {
      const v: Record<string, string> = {};
      for (const d of q.ask) {
        const g = q.gold?.[d] ?? q.gold?.structure ?? q.gold?.aesthetic ?? 'b';
        v[d] = fixed ?? (colourLed && q.stratum === 'shape-vs-colour' ? other(g) : q.stratum === 'finish-only' && d === 'structure' ? 'cant-tell' : g);
      }
      return { kind: 'triplet', ...v } as AnswerValue;
    }
    if (q.kind === 'pair') return { kind: 'pair', ...Object.fromEntries(q.ask.map((d) => [d, q.stratum === 'same-colour-diff-shape' ? (d === 'aesthetic' ? 3 : 1) : d === 'structure' ? 5 : 3])) } as AnswerValue;
    if (q.kind === 'same') return { kind: 'same', choice: q.gold ?? 'different' };
    return { kind: 'attributes', value: {} };
  };
  return [sheet('script-follows-construction', follow(false)), sheet('script-colour-led', follow(true)), sheet('script-always-b', follow(false, 'b'))];
}

let pack: QuestionPack;
let exports: LabelExport[];
if (args.includes('--tool-check')) {
  pack = makeCalibrationPack(1).pack;
  exports = scripted(pack);
  console.log('TOOL CHECK on SCRIPTED answers — checks the analysis code only. These are not people and must not be reported as results.\n');
} else {
  const dir = value('labels');
  if (!dir) {
    console.error('usage: --labels <folder> [--pack <pack.json>] | --tool-check');
    process.exit(2);
  }
  pack = readJson<QuestionPack>(value('pack') ?? 'tools/annotate/packs/calibration-v2.json');
  exports = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<LabelExport>(join(dir, f)));
  const other = exports.filter((e) => e.packId !== pack.id);
  if (other.length) console.warn(`ignoring ${other.length} export(s) for another pack: ${other.map((e) => e.rater).join(', ')}`);
  exports = exports.filter((e) => e.packId === pack.id);
  const raters = exports.map((e) => e.rater);
  if (new Set(raters).size !== raters.length) {
    console.error(`two exports share a rater code: ${raters.join(', ')}`);
    process.exit(1);
  }
}
for (const e of exports) {
  const problems = validateExport(e, pack);
  if (problems.length) {
    console.error(`${e.rater}: ${problems.join('; ')}`);
    process.exit(1);
  }
  const missing = pack.questions.length - e.answers.length;
  if (missing > 0) console.warn(`${e.rater}: ${missing} question(s) unanswered (export made before finishing?)`);
}
const r = analyseCalibration(pack, exports);
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pc = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
console.log(`raters ${r.raters.join(', ')}  ·  ${pack.id}, ${pack.questions.length} screens`);
console.log('\nTime per screen');
for (const [k, s] of Object.entries(r.secondsByScreen)) console.log(`  ${k.padEnd(18)} median ${f(s.median, 1)} s  p90 ${f(s.p90, 1)} s  (${s.n})`);
console.log(`  two questions on one screen cost ${f(dualCost(r, 'triplet'))}× one question (triplets; 2.00 = no saving)`);
console.log('\nAgreement between raters');
for (const d of DIMENSIONS) console.log(`  ${d.padEnd(10)} triplets κ ${f(r.agreement.tripletKappa[d])}   1–5 ratings α ${f(r.agreement.pairAlpha[d])}`);
console.log(`  same-thing κ ${f(r.agreement.sameKappa)}`);
const s = r.separation;
console.log('\nCan raters tell structure from overall look?');
console.log(`  structure picks shape over colour              ${pc(s.structureShapeOverColour)}   (gate ≥ 80%)`);
console.log(`  overall look picks shape over colour           ${pc(s.aestheticShapeOverColour)}   (no right answer: how much colour matters to people)`);
console.log(`  overall look notices a finish change           ${pc(s.aestheticNoticesFinish)}   (gate ≥ 80%)`);
console.log(`  structure says "can't tell" on finish-only     ${pc(s.structureIgnoresFinish)}   (reported)`);
console.log(`  photography ignored  structure ${pc(s.photoIgnored.structure)} · overall look ${pc(s.photoIgnored.aesthetic)}   (gate ≥ 80% each)`);
console.log(`  contrast pairs rated the expected way          ${pc(s.pairOrdering)}   (gate ≥ 70%)`);
console.log(`  same answer for both on contrast questions     ${pc(s.copyRateDivergent)}   (warn > 90%)`);
console.log(`\nAttention checks  ${Object.entries(r.goldAccuracyByRater).map(([k, v]) => `${k} ${pc(v)}`).join(' · ')}`);
console.log(`Ambiguous         ${exports.length < 2 ? 'needs 2+ raters' : r.ambiguous.length ? r.ambiguous.map((a) => `${a.questionId}/${a.dimension} (${a.reason})`).join(', ') : 'none'}`);
const w = workload(r, FULL_ROUND_SCREENS);
console.log(`\nFull round per rater (${Object.entries(FULL_ROUND_SCREENS).map(([k, n]) => `${n} ${k}`).join(', ')}):`);
console.log(`  ≈ ${w.minutesPerRater} min in ${w.sittings} sittings of ≤45 min  ${JSON.stringify(w.byKind)}${w.unmeasured.length ? `  (not measured: ${w.unmeasured.join(', ')})` : ''}`);
console.log(r.warnings.length ? `\nNOT READY:\n  - ${r.warnings.join('\n  - ')}` : '\nREADY for the full round');
