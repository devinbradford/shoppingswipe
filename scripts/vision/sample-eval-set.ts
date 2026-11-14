/// <reference types="node" />
/**
 * Builds the 200-product visual evaluation manifest from a catalog snapshot (V3 Milestone 1,
 * Stage 1). Reads product METADATA only (ids, types, stores, tags, photo addresses); never
 * downloads or opens an image. See docs/vision/EVALUATION_METHOD.md.
 *
 *   npm run vision:sample -- --snapshot a.json [--snapshot b.json] --snapshot-date 2026-11-09 \
 *       [--photo-meta meta.json] [--duplicates dups.json] [--seed 20261113] [--out data/vision-eval/manifest.json]
 *   npm run vision:sample -- --verify [data/vision-eval/manifest-v2.json]
 *
 * --rules v2 (default): adds the same-name-family and near-identical-page rules, writes
 *   manifest-v2.json plus manifest-v2.corrections.json (every correction vs --supersedes, default
 *   the original manifest.json, and cross-retailer candidates for review).
 * --rules v1: the original rules; reproduces data/vision-eval/manifest.json byte for byte.
 * --image-hash-checked / --cross-retailer-reviewed (with --duplicates): mark those grouping checks
 *   done once people have confirmed the duplicate candidates (tools/vision-models/fetch_images.py
 *   hashes, and the corrections file's cross-retailer list). Test scoring stays blocked until both.
 *
 * A snapshot is a JSON array of `products` rows (id, category_id, subcategory_id, retailer_id,
 * image_urls, product_url, style_tags, material, color). `--photo-meta` optionally adds the
 * measured cut-out/room kind ({ [id]: { kind } }). `--duplicates` is a JSON array of id arrays
 * that people confirmed are the same product under different addresses.
 * Same inputs + same seed = byte-identical manifest and hash.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import { crossRetailerCandidates, groupingCorrections } from '../../src/vision/corrections';
import { groupRelated } from '../../src/vision/grouping';
import { canonicalJson, checkManifest, manifestBody, snapshotRowToItem, type SnapshotRow } from '../../src/vision/manifest';
import { DEFAULT_QUOTAS, DEFAULT_SEED, sampleEvaluationSet, TEST_SHARE } from '../../src/vision/sampling';
import type { GroupingRecord, Manifest } from '../../src/vision/schema';

const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));
const value = (name: string) => values(name)[0];
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

function report(m: Manifest) {
  const problems = checkManifest(m, sha256);
  const byType = new Map<string, { dev: number; test: number }>();
  for (const i of m.items) {
    const t = byType.get(i.subcategoryId) ?? { dev: 0, test: 0 };
    t[i.split]++;
    byType.set(i.subcategoryId, t);
  }
  const multi = m.groups.filter((g) => g.members.length > 1);
  const sampledMulti = multi.filter((g) => m.items.filter((i) => i.groupId === g.id).length > 1);
  console.log(`manifest  ${m.items.length} products  dev ${m.counts.dev} / test ${m.counts.test}  (target test share ${m.testShare})`);
  console.log(`snapshot  ${m.createdFrom.snapshot}  ${m.createdFrom.snapshotDate}  ${m.createdFrom.products} products  seed ${m.seed}`);
  console.log(`groups    ${m.groups.length} touch the sample; ${multi.length} have related products; ${sampledMulti.length} have 2+ sampled members`);
  const reasons = new Map<string, number>();
  for (const g of multi) for (const r of g.reasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  console.log(`          joined by: ${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}`);
  console.log(`by type   ${[...byType].sort().map(([t, c]) => `${t} ${c.dev}/${c.test}`).join('  ')}`);
  const partners = m.items.filter((i) => i.partnerOf).length;
  const hard = m.items.filter((i) => i.hard.length).length;
  console.log(`partners  ${partners}   hard cases ${hard}`);
  console.log(`leakage   ${problems.filter((p) => p.includes('both sides')).length} groups on both sides`);
  console.log(`hash      ${m.hash}`);
  if (m.grouping) console.log(`grouping  v${m.version} rules ${m.grouping.rules.join(', ')} · image-hash check ${m.grouping.imageHashCheck} · cross-retailer review ${m.grouping.crossRetailerReview}${m.grouping.imageHashCheck === 'done' && m.grouping.crossRetailerReview === 'done' ? '' : '  → NOT FINAL: test scoring blocked'}`);
  if (problems.length) {
    console.error(`INVALID:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('valid     hash matches, no leakage, partners consistent');
}

if (args.includes('--verify')) {
  const p = args.find((a, i) => i > args.indexOf('--verify') && !a.startsWith('--')) ?? 'data/vision-eval/manifest-v2.json';
  report(readJson<Manifest>(p));
  process.exit(0);
}

const snapshots = values('snapshot');
const snapshotDate = value('snapshot-date');
if (!snapshots.length || !snapshotDate) {
  console.error('usage: --snapshot <file.json> [--snapshot …] --snapshot-date YYYY-MM-DD [--photo-meta f] [--duplicates f] [--seed n] [--out f]');
  process.exit(2);
}
const rows = snapshots.flatMap((p) => readJson<SnapshotRow[]>(p));
const meta = value('photo-meta') ? readJson<Record<string, { kind?: 'cutout' | 'scene' }>>(value('photo-meta')!) : {};
const dups = value('duplicates') ? readJson<string[][]>(value('duplicates')!) : [];
const seed = Number(value('seed') ?? DEFAULT_SEED);
const unique = new Map(rows.map((r) => [r.id, r]));
const ruleSet = value('rules') ?? 'v2';
if (ruleSet !== 'v1' && ruleSet !== 'v2') {
  console.error('--rules must be v1 (original manifest, reproduces it exactly) or v2');
  process.exit(2);
}
const v2 = ruleSet === 'v2';
const colours = [...new Set([...unique.values()].map((r) => r.color ?? ''))];
const catalog = [...unique.values()].map((r) => snapshotRowToItem(r, meta[r.id]?.kind ?? null, v2 ? colours : undefined));
const rules = v2 ? { nameFamily: true, pageFamily: true } : {};
const sample = sampleEvaluationSet(catalog, { seed, confirmedDuplicates: dups, rules });

let grouping: GroupingRecord | undefined;
let corrections: object | undefined;
if ((args.includes('--image-hash-checked') || args.includes('--cross-retailer-reviewed')) && !value('duplicates')) {
  console.error('--image-hash-checked / --cross-retailer-reviewed need --duplicates <file of person-confirmed duplicate sets> (an empty list [] if none were confirmed)');
  process.exit(2);
}
if (v2) {
  const prevPath = value('supersedes') ?? 'data/vision-eval/manifest.json';
  const prev = readJson<Manifest>(prevPath);
  const oldGroups = groupRelated(catalog.map(({ nameKey: _n, ...c }) => c), dups);
  const list = groupingCorrections(oldGroups, sample.allGroups, prev.items, sample.items);
  const cross = crossRetailerCandidates(catalog, new Set(sample.items.map((i) => i.id)));
  const correctionsFile = (value('out') ?? 'data/vision-eval/manifest-v2.json').replace(/\.json$/, '.corrections.json');
  grouping = {
    rules: ['same-photo-url', 'same-retailer-page', 'confirmed-duplicate', 'same-name-family', 'near-identical-page'],
    // Marked done only with a person-confirmed duplicates file from that check (--duplicates).
    imageHashCheck: args.includes('--image-hash-checked') ? 'done' : 'not-run',
    crossRetailerReview: args.includes('--cross-retailer-reviewed') ? 'done' : 'not-run',
    supersedes: prev.hash,
    correctionsFile: basename(correctionsFile),
  };
  const touching = list.filter((c) => c.sampled.length);
  corrections = {
    supersedes: { file: basename(prevPath), hash: prev.hash },
    note: 'Every related group that v2 rules form by joining groups v1 kept apart. "fixesLeak" = v1 had sampled members of this group on both dev and test. Cross-retailer candidates are for human review only and are NOT merged.',
    summary: {
      correctionsInCatalog: list.length,
      touchingSample: touching.length,
      leaksFixed: list.filter((c) => c.fixesLeak).length,
      sampledProductsChangingSide: sample.items.filter((i) => prev.items.find((p) => p.id === i.id)?.split !== i.split).length,
      crossRetailerCandidates: cross.length,
    },
    corrections: list,
    crossRetailerCandidates: cross,
  };
  mkdirSync(dirname(correctionsFile), { recursive: true });
  writeFileSync(correctionsFile, `${JSON.stringify(corrections, null, 1)}\n`);
  console.log(`wrote ${correctionsFile}: ${JSON.stringify((corrections as { summary: object }).summary)}`);
}
const body = manifestBody(sample, {
  snapshot: snapshots.map((p) => basename(p)).join('+'),
  snapshotDate,
  products: catalog.length,
  seed,
  quotas: DEFAULT_QUOTAS,
  testShare: TEST_SHARE,
  version: v2 ? 2 : 1,
  grouping,
});
const manifest: Manifest = { ...body, hash: sha256(canonicalJson(body)) };
const out = value('out') ?? (v2 ? 'data/vision-eval/manifest-v2.json' : 'data/vision-eval/manifest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`wrote ${out}`);
report(manifest);
