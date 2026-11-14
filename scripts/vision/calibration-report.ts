/// <reference types="node" />
/**
 * Calibration round analysis: time per question, agreement, ambiguous questions, design vs colour
 * and photo traps, attention checks, and the recommended workload for the full labelling round.
 *
 *   npm run vision:calibration -- --pack tools/annotate/packs/calibration-fixture.json --labels <dir of exports>
 *   npm run vision:calibration -- --simulate      dry run with 4 SIMULATED raters (tests the analysis only)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRng, hashSeed } from '../../src/recommendation/random';
import { analyseCalibration, FULL_ROUND_VOLUMES, workload } from '../../src/vision/calibration';
import { makeCalibrationPack } from '../../src/vision/fixtureArt';
import { LABELS_VERSION, validateExport, type Answer, type LabelExport, type QuestionPack } from '../../src/vision/schema';

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

/** Simulated raters: right on clear questions 85%; follow colour/photo on traps at their own rate. */
function simulate(pack: QuestionPack, expected: Record<string, string>): LabelExport[] {
  const profiles = [
    { name: 'sim-careful', follow: 0.05, ok: 0.9, sec: 6 },
    { name: 'sim-quick', follow: 0.15, ok: 0.85, sec: 4 },
    { name: 'sim-colour-led', follow: 0.6, ok: 0.8, sec: 5 },
    { name: 'sim-average', follow: 0.2, ok: 0.85, sec: 7 },
  ];
  return profiles.map((p) => {
    const rng = createRng(hashSeed(`sim-cal:${p.name}`));
    const answers: Answer[] = pack.questions.map((q, order) => {
      const ms = Math.round((p.sec * (0.6 + rng() * 0.8) + (q.kind === 'triplet' ? 1 : q.kind === 'same' ? 2 : 0)) * 1000);
      const base = { questionId: q.id, confidence: 2 as const, ms, order, swapped: rng() < 0.5, at: '2026-11-14T00:00:00Z' };
      const exp = expected[q.id]!;
      const base0 = (b: 'legs' | 'plinth' | 'sled') => ({ ...base, value: { kind: 'attributes' as const, value: { base: b, visualWeight: 'medium' as const } } });
      if (q.kind === 'triplet') {
        const trap = q.stratum === 'colour-trap' || q.stratum === 'photo-trap';
        const right = trap ? rng() > p.follow : q.stratum === 'gold' || rng() < p.ok;
        const choice = q.stratum !== 'gold' && rng() < 0.04 ? 'cant-tell' : right ? (exp as 'b' | 'c') : exp === 'b' ? 'c' : 'b';
        return { ...base, value: { kind: 'triplet', choice } };
      }
      if (q.kind === 'pair') {
        const centre = exp === '4-5' ? 4.4 : 1.8;
        const rating = Math.max(1, Math.min(5, Math.round(centre + (rng() - 0.5) * 2))) as 1 | 2 | 3 | 4 | 5;
        return { ...base, value: { kind: 'pair', rating } };
      }
      if (q.kind === 'attributes') {
        const base = exp.split(':')[1] === 'plinth' ? 'plinth' : exp.split(':')[1] === 'sled' ? 'sled' : 'legs';
        return { ...base0(base), ms: ms * 3 };
      }
      if (q.kind !== 'same') throw new Error(q.kind);
      const choice = q.stratum === 'gold' || rng() < p.ok ? exp : 'different';
      return { ...base, value: { kind: 'same', choice: choice as never } };
    });
    return { version: LABELS_VERSION, packId: pack.id, rater: p.name, startedAt: '2026-11-14T00:00:00Z', finishedAt: '2026-11-14T00:05:00Z', answers };
  });
}

let pack: QuestionPack;
let exports: LabelExport[];
if (args.includes('--simulate')) {
  const made = makeCalibrationPack(1);
  pack = made.pack;
  exports = simulate(pack, made.expected);
  console.log('SIMULATED raters (dry run of the analysis; not real people).');
} else {
  const packPath = value('pack') ?? 'tools/annotate/packs/calibration-fixture.json';
  const dir = value('labels');
  if (!dir) {
    console.error('usage: --pack <pack.json> --labels <dir> | --simulate');
    process.exit(2);
  }
  pack = readJson<QuestionPack>(packPath);
  exports = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<LabelExport>(join(dir, f))).filter((e) => e.packId === pack.id);
}
for (const e of exports) {
  const problems = validateExport(e, pack);
  if (problems.length) {
    console.error(`${e.rater}: ${problems.join('; ')}`);
    process.exit(1);
  }
}
const r = analyseCalibration(pack, exports);
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
console.log(`raters ${r.raters.join(', ')}  ·  ${pack.questions.length} questions`);
for (const [k, s] of Object.entries(r.secondsByKind)) console.log(`  ${k.padEnd(9)} median ${f(s.median, 1)} s  p90 ${f(s.p90, 1)} s  (${s.n} answers)`);
console.log(`agreement  triplets κ ${f(r.agreement.tripletKappa)} · same-thing κ ${f(r.agreement.sameKappa)} · 1–5 ratings α ${f(r.agreement.pairAlpha)}`);
console.log(`design over colour  ${f(r.trapAccuracy.colour * 100, 0)}%   design over photo style  ${f(r.trapAccuracy.photo * 100, 0)}%`);
console.log(`attention checks    ${Object.entries(r.goldAccuracyByRater).map(([k, v]) => `${k} ${f(v * 100, 0)}%`).join(' · ')}`);
console.log(`ambiguous           ${r.ambiguous.length ? r.ambiguous.map((a) => `${a.questionId} (${a.reason})`).join(', ') : 'none'}`);
const w = workload(r, FULL_ROUND_VOLUMES);
console.log(`\nfull round per rater (${Object.entries(FULL_ROUND_VOLUMES).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')}):`);
console.log(`  ≈ ${w.minutesPerRater} min in ${w.sittings} sittings of ≤45 min  ${JSON.stringify(w.byKind)}${r.secondsByKind.attributes ? '' : '  (attribute time not measured in this pack: add it before the real calibration)'}`);
console.log(r.warnings.length ? `\nNOT READY:\n  - ${r.warnings.join('\n  - ')}` : '\nready for the full round');
