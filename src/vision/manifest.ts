/**
 * Manifest building and checking (pure). The hash itself is computed by the script with
 * node:crypto over `canonicalJson(manifestBody)`, so anyone can re-derive it.
 */
import { findLeaks } from './grouping';
import { productNameKey } from './names';
import { MANIFEST_VERSION, type CatalogItem, type GroupingRecord, type Manifest, type Split } from './schema';
import type { SampleResult } from './sampling';

/** JSON with object keys sorted at every level and no whitespace: stable across runs and machines. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** A row of the catalog snapshot (the `products` table export). Only the fields we read. */
export interface SnapshotRow {
  id: string;
  category_id: string;
  subcategory_id: string;
  retailer_id: string;
  image_urls: string[];
  product_url: string;
  title?: string;
  style_tags: string[] | null;
  material: string | null;
  color: string | null;
}

/**
 * The retailer page a listing belongs to. Affiliate links carry the real page in `ued`; we keep
 * only its host + path (no query, so colour/size `?variant=` collapses). The affiliate link itself
 * is never written to the manifest.
 */
export function retailerPage(productUrl: string): string {
  let target = productUrl;
  try {
    const u = new URL(productUrl);
    const ued = u.searchParams.get('ued');
    if (ued) target = ued;
    const t = new URL(target);
    return `${t.host.toLowerCase().replace(/^www\./, '')}${t.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return productUrl.split(/[?#]/)[0]!.toLowerCase();
  }
}

/** `nameColours` (manifest v2): when given, the item carries `nameKey` from its title. */
export function snapshotRowToItem(r: SnapshotRow, photoKind?: 'cutout' | 'scene' | null, nameColours?: readonly string[]): CatalogItem {
  const nameKey = nameColours && r.title ? productNameKey(r.title, nameColours) : '';
  return {
    id: r.id,
    retailerId: r.retailer_id,
    subcategoryId: r.subcategory_id,
    categoryId: r.category_id,
    styleTags: [...(r.style_tags ?? [])].sort(),
    material: r.material ?? '',
    color: r.color ?? '',
    photoUrl: r.image_urls[0] ?? '',
    pagePath: retailerPage(r.product_url),
    ...(photoKind !== undefined ? { photoKind } : {}),
    ...(nameKey ? { nameKey } : {}),
  };
}

export type ManifestBody = Omit<Manifest, 'hash'>;

export function manifestBody(
  sample: SampleResult,
  meta: {
    snapshot: string;
    snapshotDate: string;
    products: number;
    seed: number;
    quotas: Record<string, number>;
    testShare: number;
    /** Defaults to MANIFEST_VERSION; 1 reproduces the original manifest exactly. */
    version?: number;
    grouping?: GroupingRecord;
  },
): ManifestBody {
  const counts = { dev: 0, test: 0 };
  for (const i of sample.items) counts[i.split]++;
  return {
    version: meta.version ?? MANIFEST_VERSION,
    createdFrom: { snapshot: meta.snapshot, snapshotDate: meta.snapshotDate, products: meta.products },
    seed: meta.seed,
    quotas: meta.quotas,
    testShare: meta.testShare,
    items: sample.items,
    groups: sample.groups,
    counts,
    ...(meta.grouping ? { grouping: meta.grouping } : {}),
  };
}

/** Problems with a manifest (empty = valid): hash, leakage, partner consistency, duplicates. */
export function checkManifest(m: Manifest, hashOf: (s: string) => string): string[] {
  const problems: string[] = [];
  const { hash, ...body } = m;
  if (hashOf(canonicalJson(body)) !== hash) problems.push('hash does not match the contents');
  const ids = new Set<string>();
  for (const i of m.items) {
    if (ids.has(i.id)) problems.push(`duplicate item ${i.id}`);
    ids.add(i.id);
  }
  const splitOf = new Map<string, Split>(m.items.map((i) => [i.id, i.split]));
  for (const leak of findLeaks(m.groups, splitOf)) problems.push(`group ${leak.groupId} is on both sides`);
  const byId = new Map(m.items.map((i) => [i.id, i]));
  for (const i of m.items) {
    if (!i.partnerOf) continue;
    const base = byId.get(i.partnerOf);
    if (!base) problems.push(`${i.id}: partner ${i.partnerOf} missing`);
    else if (base.groupId !== i.groupId || base.split !== i.split) problems.push(`${i.id}: partner in another group or split`);
  }
  for (const g of m.groups) for (const id of g.members) {
    const it = byId.get(id);
    if (it && it.groupId !== g.id) problems.push(`${id}: groupId ${it.groupId} but listed in ${g.id}`);
  }
  return problems;
}

export { pageKey, productNameKey } from './names';
