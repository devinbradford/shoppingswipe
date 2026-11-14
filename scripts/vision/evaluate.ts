/// <reference types="node" />
/**
 * Visual evaluation runner (V3 Milestone 1). See docs/vision/EVALUATION_METHOD.md.
 *
 *   npm run vision:evaluate -- --fixture
 *       End to end on SYNTHETIC data only (fake catalog, fake embeddings, simulated raters):
 *       proves the pipeline, metrics and split handling work. Numbers mean nothing about real models.
 *
 *   npm run vision:evaluate -- --split dev [--manifest data/vision-eval/manifest-v2.json] \
 *       --pack packs/dev.json [--pack …] --labels <dir of rater exports> \
 *       --embeddings siglip2=emb/siglip2.json [--embeddings …] [--judgments judgments.json] [--out report.json]
 *
 *   npm run vision:evaluate -- --split test … --thresholds <dev report.json> --reason "<what was frozen on dev>"
 *       The protected test split. Scored once per manifest + system; every attempt is logged in
 *       data/vision-eval/test-runs.json. A repeat needs --force (and is logged as forced).
 *
 * Embedding files: { "<product id>": [numbers…], … } (produced offline by tools/vision-models; Stage 2).
 * Judgments: { "<query id>": { "<candidate id>": grade 0–3 } }, or derived from relevance questions in the packs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkTestLock, evaluate, judgmentsFromExports, testScoringBlockers, type EvalProduct, type EvalReport, type TestRun } from '../../src/vision/evaluate';
import { makeFixturePack, makeFixtureWorld, simulateRaters, simulatedGrade } from '../../src/vision/fixtures';
import { hashSeed } from '../../src/recommendation/random';
import { canonicalJson } from '../../src/vision/manifest';
import { nearest } from '../../src/vision/metrics';
import { buildPool, poolContribution } from '../../src/vision/pooling';
import { groupIndex, groupRelated } from '../../src/vision/grouping';
import { sampleEvaluationSet } from '../../src/vision/sampling';
import { DIMENSIONS, type LabelExport, type Manifest, type QuestionPack, type Split } from '../../src/vision/schema';

const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));
const value = (name: string) => values(name)[0];
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const num = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const ci = (e: { mean: number; lo: number; hi: number; n: number }, f = pct) => `${f(e.mean)} [${f(e.lo)}–${f(e.hi)}] n=${e.n}`;

function print(r: EvalReport) {
  const l = r.labels;
  console.log(`\n== ${r.split.toUpperCase()} split ==  raters ${l.raters} · triplets structure ${l.triplets.structure} / overall look ${l.triplets.aesthetic} (ambiguous excluded: ${l.ambiguousTriplets.structure} / ${l.ambiguousTriplets.aesthetic}; dimensions disagree on ${l.divergentTriplets}) · pairs ${l.pairs.structure}/${l.pairs.aesthetic} · same-design ${l.same} · questions mixing splits dropped ${l.excludedMixedSplit}`);
  for (const [name, s] of Object.entries(r.systems)) {
    console.log(`\n  ${name}`);
    for (const d of DIMENSIONS) {
      const label = d === 'structure' ? 'structure' : 'overall look';
      console.log(`    ${label.padEnd(13)} triplets ${ci(s.triplets[d].accuracy)}   where dimensions disagree ${ci(s.divergent[d].accuracy)}   1–5 Spearman ${num(s.pairSpearman[d])} (${s.pairs[d]})`);
      for (const [st, e] of Object.entries(s.triplets[d].byStratum)) if (st !== 'random') console.log(`      ${st.padEnd(28)} ${ci(e)}`);
    }
    console.log(`    same-design AP        ${num(s.sameDesign.ap)} (${s.sameDesign.positives}+/${s.sameDesign.negatives}-)` + (s.sameDesign.atThreshold ? `  at threshold ${num(s.sameDesign.threshold!)} (${r.split === 'dev' ? 'chosen on dev' : 'from dev'}): precision ${pct(s.sameDesign.atThreshold.precision)} recall ${pct(s.sameDesign.atThreshold.recall)}` : ''));
    if (s.retrieval) {
      const t5 = s.retrieval.at5;
      const t = s.retrieval.at10;
      const warn = (x: { lowCoverage: boolean }) => (x.lowCoverage ? '  ⚠ LOW COVERAGE: pool this system before quoting numbers' : '');
      console.log(`    retrieval (${t.queries} queries) judged@5 ${ci(t5.judgedAtK)}${warn(t5)}  judged@10 ${ci(t.judgedAtK)}${warn(t)}`);
      console.log(`      P@5                 bounds ${pct(t5.precisionLower.mean)} … ${pct(t5.precisionUpper.mean)}  condensed ${ci(t5.precisionCondensed)}`);
      console.log(`      nDCG@10             lower ${num(t.ndcgLower.mean)}  condensed ${ci(t.ndcgCondensed, num)}`);
      console.log(`      pooled recall@10    ${ci(t.pooledRecall)}  (of relevant items FOUND BY THE POOL, not of all relevant items)`);
    }
    if (s.crossStore) console.log(`    cross-store ratio     ${ci(s.crossStore, num)}  (≈1 none; <1 prefers the query's own store)`);
  }
}

function fixture() {
  console.log('FIXTURE MODE: synthetic catalog, synthetic embeddings, simulated raters. Checks the pipeline, not any real model.');
  const world = makeFixtureWorld(150, 3, 21);
  const quotas = { nightstands: 30, sofas: 30, 'coffee-tables': 30 };
  const sample = sampleEvaluationSet(world.catalog, { quotas, partners: { colourVariant: 10, samePhoto: 0 }, seed: 5 });
  console.log(`sample ${sample.items.length} products · groups ${sample.groups.length} · leaks ${sample.leaks.length}`);
  const products: EvalProduct[] = sample.items.map((i) => ({ id: i.id, split: i.split, retailerId: i.retailerId, subcategoryId: i.subcategoryId }));
  const groupOf = groupIndex(groupRelated(world.catalog));
  const reports: Partial<Record<Split, EvalReport>> = {};
  for (const split of ['dev', 'test'] as const) {
    const ids = new Set(products.filter((p) => p.split === split).map((p) => p.id));
    const sub = { ...world, catalog: world.catalog.filter((c) => ids.has(c.id)) };
    const pack = { ...makeFixturePack(sub, 150, split === 'dev' ? 1 : 2), id: `fixture-${split}`, purpose: split };
    const exports = simulateRaters(world, pack, 3);
    const rankers = new Map([...world.systems].map(([n, emb]) => [n, (q: string, u: readonly string[]) => nearest(q, u, emb, 10)]));
    const pool = buildPool({ products: products.filter((p) => p.split === split), systems: rankers, groupOf, depth: 10, randomPerQuery: 5, seed: 3, queries: [...ids].slice(0, 30) });
    const judgments = new Map<string, Map<string, number>>();
    for (const e of pool) {
      if (!judgments.has(e.query)) judgments.set(e.query, new Map());
      judgments.get(e.query)!.set(e.candidate, simulatedGrade(world, e.query, e.candidate));
    }
    console.log(`${split}: pool ${pool.length} pairs to judge for ${judgments.size} queries; sources ${JSON.stringify(poolContribution(pool))}`);
    reports[split] = evaluate({
      split,
      products,
      packs: [pack],
      exports,
      // 'late-unpooled' was NOT in the pool: shows the coverage warning a later system would get.
      systems: new Map([...world.systems, ['late-unpooled', new Map([...world.systems.get('design')!].map(([id, v]) => [id, v.map((x, i) => x + 1.5 * Math.sin(hashSeed(`${id}:${i}`)))]))]]),
      judgments,
      thresholds: split === 'test' ? Object.fromEntries(Object.entries(reports.dev!.systems).map(([n, s]) => [n, s.sameDesign.threshold ?? NaN])) : undefined,
    });
    print(reports[split]!);
  }
  console.log('\n(Test lock not applied in fixture mode: nothing here is real.)');
}

function real() {
  const split = value('split') as Split;
  const manifestPath = value('manifest') ?? 'data/vision-eval/manifest-v2.json';
  const manifest = readJson<Manifest>(manifestPath);
  const packs = values('pack').map((p) => readJson<QuestionPack>(p));
  const labelDir = value('labels');
  const embArgs = values('embeddings');
  if (!packs.length || !labelDir || !embArgs.length) {
    console.error('needs --pack, --labels and at least one --embeddings name=file.json (Stage 2 inputs).');
    process.exit(2);
  }
  if (packs.some((p) => p.purpose !== split)) {
    console.error(`every --pack must have purpose "${split}"`);
    process.exit(2);
  }
  const exports = readdirSync(labelDir).filter((f) => f.endsWith('.json')).map((f) => readJson<LabelExport>(join(labelDir, f)));
  const systems = new Map(embArgs.map((a) => {
    const [name, file] = a.split('=');
    return [name!, new Map(Object.entries(readJson<Record<string, number[]>>(file!)))] as const;
  }));
  const judgments = value('judgments')
    ? new Map(Object.entries(readJson<Record<string, Record<string, number>>>(value('judgments')!)).map(([q, m]) => [q, new Map(Object.entries(m))]))
    : judgmentsFromExports(packs, exports);
  const products = manifest.items.map((i) => ({ id: i.id, split: i.split, retailerId: i.retailerId, subcategoryId: i.subcategoryId }));
  const thresholds = value('thresholds')
    ? Object.fromEntries(Object.entries(readJson<EvalReport>(value('thresholds')!).systems).map(([n, s]) => [n, s.sameDesign.threshold ?? NaN]))
    : undefined;

  if (split === 'test') {
    const blockers = testScoringBlockers(manifest);
    if (blockers.length) {
      console.error(`REFUSED: grouping is not final for ${manifestPath}:\n  - ${blockers.join('\n  - ')}`);
      process.exit(3);
    }
    if (!thresholds) {
      console.error('test runs need --thresholds <dev report.json>: thresholds are chosen on dev only.');
      process.exit(2);
    }
    const logPath = 'data/vision-eval/test-runs.json';
    const log: TestRun[] = existsSync(logPath) ? readJson<TestRun[]>(logPath) : [];
    const req = { manifestHash: manifest.hash, systems: [...systems.keys()].sort(), force: args.includes('--force'), reason: value('reason') ?? '' };
    const lock = checkTestLock(log, req);
    if (!lock.ok) {
      console.error(`REFUSED: ${lock.why}`);
      process.exit(3);
    }
    const inputHash = sha256(canonicalJson({ packs: packs.map((p) => p.id), exports, emb: [...systems].map(([n, m]) => [n, [...m.keys()].sort()]) }));
    log.push({ at: new Date().toISOString(), manifestHash: manifest.hash, systems: req.systems, inputHash, reason: req.reason, forced: req.force });
    writeFileSync(logPath, `${JSON.stringify(log, null, 1)}\n`);
    console.log(`test run recorded in ${logPath}`);
  }
  const report = evaluate({ split, products, packs, exports, systems, judgments: judgments.size ? judgments : undefined, thresholds });
  print(report);
  const out = value('out');
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
}

if (args.includes('--fixture')) fixture();
else if (value('split') === 'dev' || value('split') === 'test') real();
else {
  console.error('usage: --fixture | --split dev|test … (see the top of this file)');
  process.exit(2);
}
