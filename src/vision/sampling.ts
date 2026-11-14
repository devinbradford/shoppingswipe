/**
 * The 200-product visual evaluation sample (pure, seeded). TypeScript version of the dry run in
 * docs/VISUAL_INTELLIGENCE_M1_PLAN.md §2, with related-product grouping and a leakage-proof split.
 *
 * 1. Group related products across the WHOLE catalog (grouping.ts).
 * 2. Per product type, fill a quota: seeded shuffle, then greedy picks that penalise an
 *    already-chosen store, style tag and colour; no store above 60% of a type when another store
 *    sells it; at least 30% hard cases per type (default "modern", no material, "multi" colour,
 *    shared photo).
 * 3. Add partners: colour variants (same page, different colour, different photo) and
 *    same-photo partners. Partners are in the same related group by construction.
 * 4. Split by whole group, stratified by type (target test share 60%).
 */
import { createRng, hashSeed } from '@/recommendation/random';
import { findLeaks, groupIndex, groupRelated, photoKey, splitByGroup } from './grouping';
import type { CatalogItem, HardCase, ManifestItem, RelatedGroup } from './schema';

export const DEFAULT_SEED = 20261113;
export const DEFAULT_QUOTAS: Record<string, number> = {
  nightstands: 40,
  'dining-tables': 28,
  'tv-stands': 24,
  dressers: 18,
  'coffee-tables': 20,
  rugs: 16,
  sofas: 18,
  'accent-chairs': 7,
  'dining-chairs': 4,
  'bar-stools': 4,
  'bed-frames': 3,
};
export const DEFAULT_PARTNERS = { colourVariant: 12, samePhoto: 6 };
export const STORE_CAP = 0.6;
export const HARD_FLOOR = 0.3;
export const TEST_SHARE = 0.6;

export function hardCases(item: CatalogItem, photoUses: ReadonlyMap<string, number>): HardCase[] {
  const out: HardCase[] = [];
  if (item.styleTags.length === 1 && item.styleTags[0] === 'modern') out.push('default-modern');
  if (!item.material) out.push('no-material');
  if (item.color === 'multi') out.push('multi-colour');
  if ((photoUses.get(photoKey(item.photoUrl)) ?? 0) > 1) out.push('shared-photo');
  return out;
}

export interface SampleResult {
  items: ManifestItem[];
  groups: RelatedGroup[];
  leaks: ReturnType<typeof findLeaks>;
}

export function sampleEvaluationSet(
  catalog: readonly CatalogItem[],
  {
    seed = DEFAULT_SEED,
    quotas = DEFAULT_QUOTAS,
    partners = DEFAULT_PARTNERS,
    testShare = TEST_SHARE,
    confirmedDuplicates = [],
  }: {
    seed?: number;
    quotas?: Record<string, number>;
    partners?: { colourVariant: number; samePhoto: number };
    testShare?: number;
    confirmedDuplicates?: readonly string[][];
  } = {},
): SampleResult {
  const products = [...catalog].sort((a, b) => (a.id < b.id ? -1 : 1));
  const allGroups = groupRelated(products, confirmedDuplicates);
  const groupOf = groupIndex(allGroups);
  const photoUses = new Map<string, number>();
  for (const p of products) photoUses.set(photoKey(p.photoUrl), (photoUses.get(photoKey(p.photoUrl)) ?? 0) + 1);
  const hard = new Map(products.map((p) => [p.id, hardCases(p, photoUses)]));
  const rng = createRng(hashSeed(`vision-sample:${seed}`));

  const picked: { item: CatalogItem; reason: ManifestItem['reason']; partnerOf?: string }[] = [];
  for (const [type, quota] of Object.entries(quotas)) {
    const pool = products.filter((p) => p.subcategoryId === type);
    // Seeded shuffle.
    const order = pool.map((p) => ({ p, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.p);
    const stores = new Set(order.map((p) => p.retailerId));
    const cap = stores.size > 1 ? Math.max(1, Math.round(quota * STORE_CAP)) : quota;
    const got: CatalogItem[] = [];
    const cnt = new Map<string, number>();
    const tags = new Map<string, number>();
    const cols = new Map<string, number>();
    const remaining = [...order];
    while (got.length < quota && remaining.length) {
      const hardSoFar = got.filter((g) => hard.get(g.id)!.length).length;
      let best = 0;
      let bestScore = -Infinity;
      remaining.forEach((r, i) => {
        let s = -2 * (cnt.get(r.retailerId) ?? 0) - r.styleTags.reduce((a, t) => a + (tags.get(t) ?? 0), 0) - (cols.get(r.color) ?? 0);
        if (hard.get(r.id)!.length && hardSoFar < HARD_FLOOR * quota) s += 1.5;
        if ((cnt.get(r.retailerId) ?? 0) >= cap && [...stores].some((o) => o !== r.retailerId && (cnt.get(o) ?? 0) < cap)) s -= 100;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
      const [b] = remaining.splice(best, 1);
      got.push(b!);
      cnt.set(b!.retailerId, (cnt.get(b!.retailerId) ?? 0) + 1);
      cols.set(b!.color, (cols.get(b!.color) ?? 0) + 1);
      for (const t of b!.styleTags) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    for (const item of got) picked.push({ item, reason: 'quota' });
  }

  // Partners (same related group, so they always share the base's split).
  const ids = new Set(picked.map((p) => p.item.id));
  const byPage = new Map<string, CatalogItem[]>();
  const byPhoto = new Map<string, CatalogItem[]>();
  for (const p of products) {
    const pk = `${p.retailerId}|${p.pagePath}`;
    if (!byPage.has(pk)) byPage.set(pk, []);
    byPage.get(pk)!.push(p);
    const ph = photoKey(p.photoUrl);
    if (!byPhoto.has(ph)) byPhoto.set(ph, []);
    byPhoto.get(ph)!.push(p);
  }
  let colourPairs = 0;
  let photoPairs = 0;
  for (const base of picked.filter((p) => p.reason === 'quota').map((p) => p.item)) {
    if (colourPairs >= partners.colourVariant) break;
    const sib = (byPage.get(`${base.retailerId}|${base.pagePath}`) ?? []).find(
      (s) => !ids.has(s.id) && s.color !== base.color && photoKey(s.photoUrl) !== photoKey(base.photoUrl),
    );
    if (sib) {
      ids.add(sib.id);
      picked.push({ item: sib, reason: 'colour-variant-partner', partnerOf: base.id });
      colourPairs++;
    }
  }
  for (const base of picked.filter((p) => p.reason === 'quota').map((p) => p.item)) {
    if (photoPairs >= partners.samePhoto) break;
    const sib = (byPhoto.get(photoKey(base.photoUrl)) ?? []).find((s) => !ids.has(s.id));
    if (sib) {
      ids.add(sib.id);
      picked.push({ item: sib, reason: 'same-photo-partner', partnerOf: base.id });
      photoPairs++;
    }
  }

  const split = splitByGroup(
    picked.map((p) => ({ id: p.item.id, subcategoryId: p.item.subcategoryId })),
    groupOf,
    { testShare, seed },
  );
  const touching = allGroups.filter((g) => g.members.some((m) => ids.has(m)));
  const items: ManifestItem[] = picked
    .map(({ item, reason, partnerOf }) => ({
      ...item,
      groupId: groupOf.get(item.id)!,
      split: split.get(item.id)!,
      hard: hard.get(item.id)!,
      reason,
      ...(partnerOf ? { partnerOf } : {}),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { items, groups: touching, leaks: findLeaks(touching, split) };
}
