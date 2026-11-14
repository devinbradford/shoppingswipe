/// <reference types="node" />
/**
 * Turns PRIVATE rater exports into a de-identified summary that may be committed: vote counts per
 * question and dimension, median time per screen kind and the calibration report numbers.
 * No rater codes, no timestamps, no per-person answers or confidences.
 *
 *   npm run vision:summarize -- --labels <private folder> [--pack tools/annotate/packs/calibration-v2.json] [--out data/vision-eval/labels-summary/<pack id>.json]
 *
 * Raw exports stay outside the repository (data/vision-eval/labels/ is git-ignored).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { analyseCalibration, screenKey } from '../../src/vision/calibration';
import { DIMENSIONS, validateExport, type LabelExport, type QuestionPack } from '../../src/vision/schema';

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const dir = value('labels');
if (!dir) {
  console.error('usage: --labels <private folder> [--pack …] [--out …]');
  process.exit(2);
}
const pack = readJson<QuestionPack>(value('pack') ?? 'tools/annotate/packs/calibration-v2.json');
const exports = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<LabelExport>(join(dir, f))).filter((e) => e.packId === pack.id);
for (const e of exports) {
  const p = validateExport(e, pack);
  if (p.length) throw new Error(`invalid export: ${p.join('; ')}`);
}
const votes: Record<string, Record<string, Record<string, number>>> = {};
const bump = (q: string, d: string, v: string) => {
  votes[q] ??= {};
  votes[q][d] ??= {};
  votes[q][d][v] = (votes[q][d][v] ?? 0) + 1;
};
const times = new Map<string, number[]>();
for (const e of exports)
  for (const a of e.answers) {
    const q = pack.questions.find((x) => x.id === a.questionId)!;
    const k = screenKey(q);
    times.set(k, [...(times.get(k) ?? []), a.ms]);
    const v = a.value;
    if (v.kind === 'triplet' || v.kind === 'pair') for (const d of DIMENSIONS) { if (v[d] !== undefined) bump(q.id, d, String(v[d])); }
    else if (v.kind === 'same') bump(q.id, 'same', v.choice);
    else if (v.kind === 'relevance') bump(q.id, 'relevance', String(v.grade));
    else for (const [f, val] of Object.entries(v.value)) bump(q.id, `attr:${f}`, String(val));
  }
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const r = analyseCalibration(pack, exports);
const summary = {
  packId: pack.id,
  raters: exports.length,
  note: 'De-identified summary. Raw exports (rater codes, timestamps, per-person answers) are kept privately and never committed.',
  votes,
  medianSecondsByScreen: Object.fromEntries([...times].sort().map(([k, v]) => [k, Math.round(median(v) / 100) / 10])),
  agreement: r.agreement,
  separation: r.separation,
  attentionChecksAllPassed: Object.values(r.goldAccuracyByRater).every((x) => x >= 0.9),
  ambiguous: r.ambiguous.map((a) => `${a.questionId}/${a.dimension}`),
  warnings: r.warnings.filter((w) => !/^rater /.test(w)),
};
const out = value('out') ?? `data/vision-eval/labels-summary/${pack.id}.json`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(summary, null, 1)}\n`);
console.log(`wrote ${out} (${exports.length} raters, de-identified)`);
