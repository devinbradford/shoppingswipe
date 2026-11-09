/**
 * The import pipeline: feed rows → catalog products + a report.
 *
 *   1. Normalise rows (network adapter, e.g. Awin).
 *   2. Sort into our types; leave out what we don't sell (outdoor, kids, mattresses…).
 *   3. Group sizes of the same product; pick one representative size.
 *   4. Basic checks (price, photo, link, stock).
 *   5. Optional health check through an injected `probe`: the photo really loads and
 *      the link still lands on that product (not a 404 or a generic collection page).
 *
 * Broken products are left out and counted in the report (Devin's call).
 */
import { awinRowToItem, urlPath } from './awin';
import { googleRowToItem, isGoogleRow } from './google';
import { classifyType, readColour, readMaterial, readStyles, roomOf } from './classify';
import { clip, sizeArea } from './text';
import type { FeedItem, ImportedProduct, ImportReport, Probe, SkipReason } from './types';
import type { SubcategoryId } from '../domain/types';

export interface ImportSource {
  /** Our retailer id, e.g. "awin-88509". */
  retailerId: string;
  network: 'awin';
}

export interface ImportOptions {
  /** Most products to keep from one feed (after checks). */
  maxProducts?: number;
  /** Fetches photos and pages to confirm they work. Leave out to skip the online checks. */
  probe?: Probe;
  /** Parallel requests during health checks. */
  concurrency?: number;
  /** Stop starting new health checks after this long (ms); unchecked products are reported. */
  timeBudgetMs?: number;
  /** For tests. */
  now?: () => number;
}

/** Typical size to show per product type (sq ft for rugs); other types use the cheapest size. */
const PREFERRED_AREA: Partial<Record<SubcategoryId, number>> = { rugs: 40 };

const MIN_PRICE_CENTS = 1500;
const MAX_PRICE_CENTS = 5_000_000;

export async function importFeed(
  rows: readonly Record<string, string>[],
  source: ImportSource,
  { maxProducts = 2000, probe, concurrency = 8, timeBudgetMs = 100_000, now = Date.now }: ImportOptions = {},
): Promise<{ products: ImportedProduct[]; report: ImportReport }> {
  const report: ImportReport = { rows: rows.length, products: 0, imported: 0, skipped: {}, byType: {}, examples: {} };
  const skip = (reason: SkipReason, label: string, n = 1) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + n;
    const ex = (report.examples[reason] ??= []);
    if (ex.length < 5) ex.push(label);
  };

  // 1–2. Normalise and sort.
  const groups = new Map<string, { type: SubcategoryId; items: FeedItem[] }>();
  const leftOut = new Set<string>();
  for (const row of rows) {
    const item = isGoogleRow(row) ? googleRowToItem(row) : awinRowToItem(row);
    if (!item.title || !item.externalId) continue;
    const c = classifyType(item.title, item.categoryText);
    if ('skip' in c) {
      // Count each product once, not once per size.
      if (!leftOut.has(item.groupKey)) skip(c.skip, item.title);
      leftOut.add(item.groupKey);
      continue;
    }
    const g = groups.get(item.groupKey);
    if (g) g.items.push(item);
    else groups.set(item.groupKey, { type: c.type, items: [item] });
  }
  report.products = groups.size + leftOut.size;

  // 3–4. One product per group, with basic checks.
  const candidates: ImportedProduct[] = [];
  for (const { type, items } of groups.values()) {
    const sellable = items.filter((i) => i.inStock);
    if (sellable.length === 0) {
      skip('out-of-stock', items[0].title);
      continue;
    }
    const pick = representative(sellable, type);
    if (pick.priceCents < MIN_PRICE_CENTS || pick.priceCents > MAX_PRICE_CENTS) {
      skip('bad-price', pick.title);
      continue;
    }
    if (pick.imageUrls.length === 0) {
      skip('no-image', pick.title);
      continue;
    }
    if (!pick.trackingUrl) {
      skip('no-link', pick.title);
      continue;
    }
    candidates.push({
      // From the product group, not the chosen size, so it stays the same when a size sells out.
      id: `${source.retailerId}-${stableId(pick.groupKey)}`,
      externalId: pick.externalId,
      categoryId: roomOf(type),
      subcategoryId: type,
      retailerId: source.retailerId,
      title: pick.title,
      brand: pick.brand,
      description: clip(pick.description || pick.title, 600),
      priceCents: pick.priceCents,
      currency: pick.currency,
      imageUrls: pick.imageUrls.slice(0, 5),
      productUrl: pick.trackingUrl,
      styleTags: readStyles(pick.title, pick.description),
      material: readMaterial(pick.title, pick.description),
      color: readColour(pick.title, pick.colourField, pick.description),
      merchantUrl: pick.merchantUrl,
    });
  }

  // 5. Online health check (optional).
  let healthy = candidates;
  if (probe) {
    const started = now();
    const results = await mapLimit(candidates, concurrency, async (p) => {
      if (now() - started > timeBudgetMs) return 'not-checked-yet' as const;
      return checkHealth(p, probe);
    });
    healthy = [];
    results.forEach((r, i) => {
      if (r === 'ok') healthy.push(candidates[i]);
      else skip(r, candidates[i].title);
    });
  }

  // Cap per feed, keeping variety: round-robin across product types.
  const byType = new Map<SubcategoryId, ImportedProduct[]>();
  for (const p of [...healthy].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const list = byType.get(p.subcategoryId) ?? [];
    list.push(p);
    byType.set(p.subcategoryId, list);
  }
  const products: ImportedProduct[] = [];
  while (products.length < maxProducts && [...byType.values()].some((l) => l.length)) {
    for (const list of byType.values()) {
      const p = list.shift();
      if (p && products.length < maxProducts) products.push(p);
    }
  }
  const leftover = [...byType.values()].reduce((n, l) => n + l.length, 0);
  if (leftover) skip('over-limit', `${leftover} more`, leftover);

  for (const p of products) report.byType[p.subcategoryId] = (report.byType[p.subcategoryId] ?? 0) + 1;
  report.imported = products.length;
  return { products, report };
}

function representative(items: FeedItem[], type: SubcategoryId): FeedItem {
  const target = PREFERRED_AREA[type];
  if (target) {
    const sized = items.map((i) => ({ i, a: sizeArea(i.sizeLabel) })).filter((x) => x.a !== null);
    if (sized.length)
      return sized.reduce((best, x) => (Math.abs(x.a! - target) < Math.abs(best.a! - target) ? x : best)).i;
  }
  return items.reduce((best, i) =>
    i.priceCents > 0 && (best.priceCents <= 0 || i.priceCents < best.priceCents) ? i : best,
  );
}

/** The first photo must load as a real image; the store page must still be that product. */
export async function checkHealth(p: ImportedProduct, probe: Probe): Promise<'ok' | SkipReason> {
  try {
    const img = await probe(p.imageUrls[0], 'image');
    // Tiny responses are usually "no image" placeholders.
    if (!img.ok || !img.contentType.startsWith('image/') || (img.size !== null && img.size < 2000))
      return 'image-broken';
  } catch {
    return 'image-broken';
  }
  if (!p.merchantUrl) return 'ok';
  try {
    const page = await probe(p.merchantUrl, 'page');
    if (!page.ok) return 'link-broken';
    if (urlPath(page.finalUrl) !== urlPath(p.merchantUrl)) return 'link-redirects-away';
    return 'ok';
  } catch {
    return 'link-broken';
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** Short, stable id for a product group: two 32-bit FNV-1a hashes (64 bits), base 36. */
export function stableId(key: string): string {
  const fnv = (seed: number) => {
    let h = seed;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return `${fnv(0x811c9dc5)}${fnv(0x050c5d1f)}`;
}
