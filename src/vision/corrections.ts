/**
 * Grouping corrections between two manifests, and cross-retailer duplicate CANDIDATES (manifest
 * v2). Pure.
 *
 * A correction = a new related group that joins products the old rules kept apart. Every one is
 * recorded with the rule(s) that joined it, so the change from v1 to v2 is fully auditable.
 * Cross-retailer candidates are only flagged for human review (different stores often reuse generic
 * names and file names); they are never merged automatically.
 */
import { photoKey } from './grouping';
import type { CatalogItem, GroupReason, ManifestItem, RelatedGroup, Split } from './schema';

export interface GroupingCorrection {
  /** The new (corrected) group. */
  group: string;
  /** Old groups it merges (2+). */
  merged: string[];
  /** Rules that produced the new group's links. */
  reasons: GroupReason[];
  members: number;
  /** Sampled members, with their side before and after. */
  sampled: { id: string; before: Split | null; after: Split }[];
  /** True when the old manifest had sampled members of this new group on BOTH sides (a leak it fixes). */
  fixesLeak: boolean;
}

export function groupingCorrections(
  oldGroups: readonly RelatedGroup[],
  newGroups: readonly RelatedGroup[],
  oldItems: readonly Pick<ManifestItem, 'id' | 'split'>[],
  newItems: readonly Pick<ManifestItem, 'id' | 'split'>[],
): GroupingCorrection[] {
  const oldOf = new Map(oldGroups.flatMap((g) => g.members.map((m) => [m, g.id] as const)));
  const before = new Map(oldItems.map((i) => [i.id, i.split]));
  const after = new Map(newItems.map((i) => [i.id, i.split]));
  const out: GroupingCorrection[] = [];
  for (const g of newGroups) {
    const merged = [...new Set(g.members.map((m) => oldOf.get(m) ?? `g:${m}`))].sort();
    if (merged.length < 2) continue;
    const sampled = g.members.filter((m) => after.has(m)).map((id) => ({ id, before: before.get(id) ?? null, after: after.get(id)! }));
    const oldSides = new Set(g.members.map((m) => before.get(m)).filter(Boolean));
    out.push({ group: g.id, merged, reasons: g.reasons, members: g.members.length, sampled, fixesLeak: oldSides.size > 1 });
  }
  return out.sort((a, b) => Number(b.fixesLeak) - Number(a.fixesLeak) || b.sampled.length - a.sampled.length || (a.group < b.group ? -1 : 1));
}

export interface CrossRetailerCandidate {
  signal: 'same-name-other-store' | 'same-photo-file-other-store';
  key: string;
  products: { id: string; retailerId: string; inSample: boolean }[];
}

/**
 * Possible same-design products sold by different stores: same normalised name, or the same
 * distinctive photo file name (≥ 16 characters, so "1.jpg" style names don't match). Only
 * candidates that touch the sample are returned.
 */
export function crossRetailerCandidates(catalog: readonly CatalogItem[], sampled: ReadonlySet<string>): CrossRetailerCandidate[] {
  const out: CrossRetailerCandidate[] = [];
  const scan = (signal: CrossRetailerCandidate['signal'], keyOf: (c: CatalogItem) => string) => {
    const by = new Map<string, CatalogItem[]>();
    for (const c of catalog) {
      const k = keyOf(c);
      if (k) by.set(k, [...(by.get(k) ?? []), c]);
    }
    for (const [key, cs] of [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (new Set(cs.map((c) => c.retailerId)).size < 2) continue;
      if (!cs.some((c) => sampled.has(c.id))) continue;
      out.push({ signal, key, products: cs.map((c) => ({ id: c.id, retailerId: c.retailerId, inSample: sampled.has(c.id) })).sort((a, b) => (a.id < b.id ? -1 : 1)) });
    }
  };
  scan('same-name-other-store', (c) => c.nameKey ?? '');
  scan('same-photo-file-other-store', (c) => {
    const file = photoKey(c.photoUrl).split('/').pop() ?? '';
    const stem = file.replace(/\.[a-z0-9]+$/, '');
    return stem.length >= 16 ? stem : '';
  });
  return out;
}
