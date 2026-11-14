/// <reference types="node" />
/**
 * Computes the non-visual comparison systems (tags, colour-aware, text, random) for the manifest
 * products from the catalog snapshot, and a TECHNICAL sanity check on DEV products only. The check
 * uses catalog facts, not human labels, so it is never a quality score:
 *   - variant recall@5: is a product's own colour/photo partner (same store page or same photo)
 *     among its 5 nearest same-type neighbours?
 *   - same-store share@10 vs the share expected by chance (a store-shortcut indicator)
 *   - retrieval latency per query (brute-force cosine over the dev universe)
 *
 *   npm run vision:baselines -- --snapshot a.json [--snapshot b.json] [--manifest data/vision-eval/manifest-v2.json]
 *
 * Vectors go to data/vision-eval/embeddings/ (git-ignored: derived from retailer catalog text).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { allBaselines, type BaselineProduct } from '../../src/vision/baselines';
import { nearest } from '../../src/vision/metrics';
import type { Manifest } from '../../src/vision/schema';

const args = process.argv.slice(2);
const values = (name: string) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]!] : []));
type Row = { id: string; title?: string; description?: string; style_tags: string[] | null; material: string | null; color: string | null; subcategory_id: string };
const rows = new Map(values('snapshot').flatMap((p) => JSON.parse(readFileSync(p, 'utf8')) as Row[]).map((r) => [r.id, r]));
const manifest = JSON.parse(readFileSync(values('manifest')[0] ?? 'data/vision-eval/manifest-v2.json', 'utf8')) as Manifest;
if (!rows.size) {
  console.error('usage: --snapshot <file.json> [--snapshot …] [--manifest …]');
  process.exit(2);
}
const products: BaselineProduct[] = manifest.items.map((i) => {
  const r = rows.get(i.id);
  if (!r) throw new Error(`${i.id} missing from the snapshot`);
  return { id: i.id, subcategoryId: i.subcategoryId, styleTags: r.style_tags ?? [], material: r.material ?? '', color: r.color ?? '', title: r.title ?? '', description: r.description ?? '' };
});
const systems = allBaselines(products);
mkdirSync('data/vision-eval/embeddings', { recursive: true });
for (const [name, v] of systems) writeFileSync(`data/vision-eval/embeddings/baseline-${name}.json`, `${JSON.stringify(Object.fromEntries(v))}\n`);

const dev = manifest.items.filter((i) => i.split === 'dev');
const devIds = dev.map((i) => i.id);
const byId = new Map(manifest.items.map((i) => [i.id, i]));
const partnerPairs = dev.filter((i) => i.partnerOf && byId.get(i.partnerOf)?.split === 'dev').map((i) => [i.partnerOf!, i.id] as const);
console.log(`DEV only: ${dev.length} products, ${partnerPairs.length} variant/photo partner pairs (catalog facts, not human labels)\n`);
console.log('system         variant recall@5   same-store share@10 (chance)   ms/query');
for (const [name, emb] of systems) {
  let hits = 0;
  for (const [a, b] of partnerPairs) {
    const uni = devIds.filter((x) => x !== a && byId.get(x)!.subcategoryId === byId.get(a)!.subcategoryId);
    if (nearest(a, uni, emb, 5).includes(b)) hits++;
  }
  let same = 0, chance = 0, k = 0;
  const t0 = performance.now();
  for (const q of devIds) {
    const uni = devIds.filter((x) => x !== q && byId.get(x)!.subcategoryId === byId.get(q)!.subcategoryId);
    const top = nearest(q, uni, emb, 10);
    if (!top.length) continue;
    same += top.filter((x) => byId.get(x)!.retailerId === byId.get(q)!.retailerId).length / top.length;
    chance += uni.filter((x) => byId.get(x)!.retailerId === byId.get(q)!.retailerId).length / uni.length;
    k++;
  }
  const ms = (performance.now() - t0) / devIds.length;
  console.log(`${name.padEnd(14)} ${`${hits}/${partnerPairs.length}`.padEnd(18)} ${((same / k) * 100).toFixed(0).padStart(3)}% (${((chance / k) * 100).toFixed(0)}%)${''.padEnd(19)} ${ms.toFixed(2)}`);
}
console.log('\nwrote data/vision-eval/embeddings/baseline-{tags,colour-aware,text,random}.json (git-ignored)');
