/// <reference types="node" />
/**
 * Read-only audit of the frozen evaluation manifest against the catalog snapshot it came from.
 * Changes nothing. Reports:
 *   1. manifest validity (hash, leakage, partners)
 *   2. grouping reproducibility (re-deriving groups from the snapshot gives the same groups)
 *   3. possible duplicates the address rules can't see: same store + same normalised product
 *      name, or same store + near-identical page address (colour, size and count words removed),
 *      in different groups, with their splits
 *   4. coverage per product type: products, independent groups and stores on each side
 *
 *   npm run vision:audit -- --snapshot a.json [--snapshot b.json] [--manifest data/vision-eval/manifest.json]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { groupRelated } from '../../src/vision/grouping';
import { checkManifest, pageKey, productNameKey, snapshotRowToItem, type SnapshotRow } from '../../src/vision/manifest';
import type { Manifest } from '../../src/vision/schema';

const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const manifest = readJson<Manifest>(values('manifest')[0] ?? 'data/vision-eval/manifest.json');
const rows = values('snapshot').flatMap((p) => readJson<(SnapshotRow & { title?: string })[]>(p));
if (!rows.length) {
  console.error('usage: --snapshot <file.json> [--snapshot …] [--manifest …]');
  process.exit(2);
}
let problems = 0;

// 1. Validity
const v = checkManifest(manifest, sha256);
console.log(`1. manifest ${manifest.hash.slice(0, 12)}…  ${v.length ? `INVALID: ${v.join('; ')}` : 'valid: hash matches, 0 groups on both sides, partners consistent'}`);
problems += v.length;

// 2. Reproducibility of grouping
const byId = new Map(rows.map((r) => [r.id, r]));
const catalog = [...byId.values()].map((r) => snapshotRowToItem(r));
const regrouped = groupRelated(catalog);
const regroupOf = new Map(regrouped.flatMap((g) => g.members.map((m) => [m, g] as const)));
let mismatched = 0;
for (const g of manifest.groups) {
  const r = regroupOf.get(g.members[0]!);
  if (!r || r.id !== g.id || r.members.join() !== g.members.join()) mismatched++;
}
console.log(`2. grouping  ${manifest.groups.length} manifest groups re-derived from the snapshot: ${mismatched ? `${mismatched} DIFFER` : 'identical'}`);
problems += mismatched;

// 3. Same normalised name in different groups
const shopColours = catalog.map((c) => c.color);
const norm = (t: string) => productNameKey(t, shopColours);
const splitOf = new Map(manifest.items.map((i) => [i.id, i.split]));
const testGroups = new Set(manifest.items.filter((i) => i.split === 'test').map((i) => i.groupId));
const devGroups = new Set(manifest.items.filter((i) => i.split === 'dev').map((i) => i.groupId));
// Two signals: same store + same normalised name, and same store + near-identical page address.
const byName = new Map<string, string[]>();
const add = (key: string, id: string) => byName.set(key, [...(byName.get(key) ?? []), id]);
for (const r of rows) {
  const item = catalog.find((c) => c.id === r.id)!;
  const k = r.title ? norm(r.title) : '';
  if (k) add(`name|${r.retailer_id}|${k}`, r.id); // same store only: different stores reuse generic names
  const pk = pageKey(item.pagePath, shopColours);
  if (pk) add(`page|${r.retailer_id}|${pk}`, r.id);
}
type Finding = { name: string; groups: number; stores: number; sides: string };
const findings: Finding[] = [];
for (const [name, ids] of byName) {
  const groups = new Set(ids.map((id) => regroupOf.get(id)!.id));
  if (groups.size < 2) continue;
  const touched = [...groups].filter((g) => testGroups.has(g) || devGroups.has(g));
  if (!touched.length) continue;
  const sides = new Set<string>();
  for (const g of groups) {
    if (testGroups.has(g)) sides.add('test');
    if (devGroups.has(g)) sides.add('dev');
  }
  const stores = new Set(ids.map((id) => byId.get(id)!.retailer_id)).size;
  const [signal, , ...rest] = name.split('|');
  findings.push({ name: `${signal}: ${rest.join(' ')}`, groups: groups.size, stores, sides: [...sides].sort().join('+') || 'unsampled' });
}
const crossSplit = findings.filter((f) => f.sides === 'dev+test');
console.log(`3. families  ${findings.length} same-store name or page families (colour/size words removed) span 2+ groups touching the sample; ${crossSplit.length} span dev AND test`);
for (const f of [...crossSplit, ...findings.filter((x) => x.sides !== 'dev+test')].slice(0, 15)) console.log(`     ${f.sides.padEnd(9)} groups ${f.groups} stores ${f.stores}  "${f.name}"`);
if (findings.length > 15) console.log(`     … ${findings.length - 15} more`);
console.log('   (Same name or similar page ≠ same design: stores reuse collection names across different designs. These are candidates for the Stage 2 human duplicate review, not confirmed duplicates.)');

// 4. Coverage
console.log('4. coverage  type            dev items/groups/stores   test items/groups/stores');
const types = [...new Set(manifest.items.map((i) => i.subcategoryId))].sort();
for (const t of types) {
  const side = (s: 'dev' | 'test') => {
    const its = manifest.items.filter((i) => i.subcategoryId === t && i.split === s);
    return `${String(its.length).padStart(3)} / ${String(new Set(its.map((i) => i.groupId)).size).padStart(3)} / ${new Set(its.map((i) => i.retailerId)).size}`;
  };
  console.log(`            ${t.padEnd(16)} ${side('dev').padEnd(25)} ${side('test')}`);
}
const unsampledProtected = manifest.groups.filter((g) => g.members.some((m) => splitOf.get(m) === 'test')).reduce((n, g) => n + g.members.filter((m) => !splitOf.has(m)).length, 0);
console.log(`            unsampled catalog products protected with a test group: ${unsampledProtected}`);
process.exit(problems ? 1 : 0);
