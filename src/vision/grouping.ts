/**
 * Related-product grouping and the leakage-proof dev/test split.
 *
 * Products are RELATED when any of these holds (each is an edge; groups are the connected
 * components, built with union-find, so relatedness is transitive):
 *   - same photo address (query string ignored: the CDN's ?v= cache-buster doesn't make a new photo)
 *   - same image content hash (once photos are hashed in Stage 2)
 *   - same retailer product page (colour and size variants of one design live on one page)
 *   - listed together in the confirmed-duplicates file (e.g. one design sold under two URLs)
 *   - v2 (opt-in, `rules`): same store + same normalised product name (`productNameKey`), and
 *     same store + near-identical page address (`pageKey`). Deliberately over-inclusive: grouping
 *     too much only costs split balance; grouping too little leaks.
 *
 * The split assigns WHOLE groups to dev or test, stratified by product type: within each type,
 * groups are visited in a seeded order and go to test until that type's test share reaches the
 * target. Counts can drift from the exact 80/120 target because a group is never cut in two.
 * Pure and deterministic.
 */
import { createRng, hashSeed } from '@/recommendation/random';
import { pageKey } from './names';
import type { CatalogItem, GroupingRules, GroupReason, RelatedGroup, Split } from './schema';

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p === x) return x;
    p = this.find(p);
    this.parent.set(x, p);
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Smaller id becomes the root, so group ids don't depend on input order.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

/** The photo address without its query string (Shopify adds ?v=… cache-busters). */
export function photoKey(url: string): string {
  return url.split('?')[0]!.trim().toLowerCase();
}

/**
 * Groups related products. `confirmedDuplicates` lists sets of ids people confirmed as the same
 * design (different URLs). Every product ends up in exactly one group (singletons included).
 */
export function groupRelated(
  items: readonly CatalogItem[],
  confirmedDuplicates: readonly string[][] = [],
  rules: GroupingRules = {},
): RelatedGroup[] {
  const uf = new UnionFind();
  const reasons = new Map<string, Set<GroupReason>>();
  const note = (a: string, b: string, why: GroupReason) => {
    uf.union(a, b);
    for (const id of [a, b]) {
      if (!reasons.has(id)) reasons.set(id, new Set());
      reasons.get(id)!.add(why);
    }
  };
  const ids = new Set(items.map((i) => i.id));
  const byKey = (key: (i: CatalogItem) => string | undefined, why: GroupReason) => {
    const first = new Map<string, string>();
    for (const item of [...items].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const k = key(item);
      if (!k) continue;
      const seen = first.get(k);
      if (seen) note(seen, item.id, why);
      else first.set(k, item.id);
    }
  };
  byKey((i) => photoKey(i.photoUrl), 'same-photo-url');
  byKey((i) => i.imageHash, 'same-image-hash');
  byKey((i) => (i.pagePath ? `${i.retailerId}|${i.pagePath}` : undefined), 'same-retailer-page');
  if (rules.nameFamily) byKey((i) => (i.nameKey ? `${i.retailerId}|${i.nameKey}` : undefined), 'same-name-family');
  if (rules.pageFamily) {
    const colours = [...new Set(items.map((i) => i.color))];
    byKey((i) => {
      const k = i.pagePath ? pageKey(i.pagePath, colours) : '';
      return k ? `${i.retailerId}|${k}` : undefined;
    }, 'near-identical-page');
  }
  for (const set of confirmedDuplicates) {
    const present = set.filter((id) => ids.has(id));
    for (let k = 1; k < present.length; k++) note(present[0]!, present[k]!, 'confirmed-duplicate');
  }

  const members = new Map<string, string[]>();
  for (const item of items) {
    const root = uf.find(item.id);
    if (!members.has(root)) members.set(root, []);
    members.get(root)!.push(item.id);
  }
  return [...members.entries()]
    .map(([root, ms]) => {
      const sorted = [...ms].sort();
      const why = new Set<GroupReason>();
      for (const id of sorted) for (const r of reasons.get(id) ?? []) why.add(r);
      return { id: `g:${root}`, members: sorted, reasons: [...why].sort() };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Map product id → group id. */
export function groupIndex(groups: readonly RelatedGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const id of g.members) m.set(id, g.id);
  return m;
}

/**
 * Assigns each sampled product to dev or test by its whole group. `sampled` are the products in
 * the evaluation set; `typeOf` gives each one's product type for stratification.
 */
export function splitByGroup(
  sampled: readonly { id: string; subcategoryId: string }[],
  groupOf: ReadonlyMap<string, string>,
  { testShare, seed }: { testShare: number; seed: number },
): Map<string, Split> {
  // Sampled members per group, and the group's type (the type of its first sampled member).
  const groups = new Map<string, { ids: string[]; type: string }>();
  for (const s of [...sampled].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const g = groupOf.get(s.id) ?? `g:${s.id}`;
    if (!groups.has(g)) groups.set(g, { ids: [], type: s.subcategoryId });
    groups.get(g)!.ids.push(s.id);
  }
  const byType = new Map<string, [string, string[]][]>();
  for (const [g, { ids, type }] of groups) {
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push([g, ids]);
  }
  const out = new Map<string, Split>();
  for (const [type, list] of [...byType].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const rng = createRng(hashSeed(`split:${seed}:${type}`));
    const order = list.map((x) => ({ x, r: rng() })).sort((a, b) => a.r - b.r).map((o) => o.x);
    const total = order.reduce((n, [, ids]) => n + ids.length, 0);
    const target = Math.round(total * testShare);
    let inTest = 0;
    for (const [, ids] of order) {
      // Put the group in test if that moves the type's test count closer to its target.
      const closer = Math.abs(inTest + ids.length - target) <= Math.abs(inTest - target);
      const split: Split = closer && inTest < target ? 'test' : 'dev';
      if (split === 'test') inTest += ids.length;
      for (const id of ids) out.set(id, split);
    }
  }
  return out;
}

/** Every pair of related products that ended up on different sides (must be empty). */
export function findLeaks(
  groups: readonly RelatedGroup[],
  splitOf: ReadonlyMap<string, Split>,
): { groupId: string; dev: string[]; test: string[] }[] {
  const leaks: { groupId: string; dev: string[]; test: string[] }[] = [];
  for (const g of groups) {
    const dev = g.members.filter((id) => splitOf.get(id) === 'dev');
    const test = g.members.filter((id) => splitOf.get(id) === 'test');
    if (dev.length && test.length) leaks.push({ groupId: g.id, dev, test });
  }
  return leaks;
}

/** A question may only use products from one side; returns the side, or null if it mixes sides. */
export function questionSplit(productIds: readonly string[], splitOf: ReadonlyMap<string, Split>): Split | null {
  const sides = new Set(productIds.map((id) => splitOf.get(id)));
  if (sides.size !== 1 || sides.has(undefined)) return null;
  return [...sides][0]!;
}
