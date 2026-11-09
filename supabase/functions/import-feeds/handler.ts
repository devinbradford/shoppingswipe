/**
 * The nightly import, as plain logic with its database and network calls passed in,
 * so it can be tested in Jest. index.ts wires it to Supabase, Awin and the network.
 */
import { importFeed, parseCsv, type ImportedProduct, type ImportReport, type Probe } from '../../../src/feeds/index.ts';

export interface FeedSource {
  id: string;
  network: 'awin';
  advertiser_id: string;
  feed_id: string;
  name: string;
  domain: string;
  enabled: boolean;
  max_products: number;
}

export interface ImportDeps {
  listSources(onlyId?: string): Promise<FeedSource[]>;
  /** The feed as CSV text (may include other stores; rows are matched on advertiser_id). */
  download(source: FeedSource): Promise<string>;
  saveRetailer(source: FeedSource): Promise<void>;
  upsertProducts(rows: ProductRow[]): Promise<void>;
  /** Marks this store's products not refreshed since `before` as inactive; returns how many. */
  deactivateStale(retailerId: string, before: string): Promise<number>;
  startRun(sourceId: string): Promise<string>;
  finishRun(runId: string, result: RunResult): Promise<void>;
  probe: Probe;
  now(): Date;
  /** Health-check time per store (ms). */
  timeBudgetMs?: number;
}

export interface RunResult {
  status: 'ok' | 'failed';
  imported?: number;
  deactivated?: number;
  report?: ImportReport;
  error?: string;
}

/** A row for the `products` table. */
export interface ProductRow {
  id: string;
  subcategory_id: string;
  category_id: string;
  retailer_id: string;
  external_id: string;
  title: string;
  brand: string;
  description: string;
  price_cents: number;
  currency: string;
  image_urls: string[];
  product_url: string;
  style_tags: string[];
  material: string;
  color: string;
  is_active: boolean;
  updated_at: string;
}

export function toRow(p: ImportedProduct, updatedAt: string): ProductRow {
  return {
    id: p.id,
    subcategory_id: p.subcategoryId,
    category_id: p.categoryId,
    retailer_id: p.retailerId,
    external_id: p.externalId,
    title: p.title,
    brand: p.brand,
    description: p.description,
    price_cents: p.priceCents,
    currency: p.currency,
    image_urls: p.imageUrls,
    product_url: p.productUrl,
    style_tags: p.styleTags,
    material: p.material,
    color: p.color,
    is_active: true,
    updated_at: updatedAt,
  };
}

const BATCH = 500;

/** Imports every enabled feed (or just one). One store failing never stops the others. */
export async function runImports(deps: ImportDeps, onlyId?: string): Promise<{ source: string; result: RunResult }[]> {
  const sources = (await deps.listSources(onlyId)).filter((s) => s.enabled);
  const out: { source: string; result: RunResult }[] = [];
  for (const source of sources) out.push({ source: source.id, result: await importOne(source, deps) });
  return out;
}

async function importOne(source: FeedSource, deps: ImportDeps): Promise<RunResult> {
  const runId = await deps.startRun(source.id);
  const startedAt = deps.now().toISOString();
  let result: RunResult;
  try {
    // A combined download (several stores in one file) holds other stores' rows too.
    const rows = parseCsv(await deps.download(source), ',', (r) => {
      const store = (r.merchant_id || r.advertiser_id || '').trim();
      return !store || store === source.advertiser_id;
    });
    // An empty or unreadable download is a problem with the feed, not "everything was discontinued":
    // change nothing in the catalog.
    if (rows.length === 0) throw new Error('The feed came back empty, so nothing was changed.');
    const { products, report } = await importFeed(
      rows,
      { retailerId: source.id, network: source.network },
      { maxProducts: source.max_products, probe: deps.probe, timeBudgetMs: deps.timeBudgetMs ?? 120_000 },
    );
    await deps.saveRetailer(source);
    const stamped = products.map((p) => toRow(p, startedAt));
    for (let i = 0; i < stamped.length; i += BATCH) await deps.upsertProducts(stamped.slice(i, i + BATCH));
    // Anything from this store that wasn't refreshed in this run is gone or broken: hide it.
    // (Products that only missed the health check for lack of time are retried tomorrow.)
    const deactivated = report.skipped['not-checked-yet'] ? 0 : await deps.deactivateStale(source.id, startedAt);
    result = { status: 'ok', imported: products.length, deactivated, report };
  } catch (e) {
    result = { status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
  await deps.finishRun(runId, result);
  return result;
}
