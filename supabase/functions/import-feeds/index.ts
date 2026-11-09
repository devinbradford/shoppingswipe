/**
 * Supabase Edge Function: POST /functions/v1/import-feeds
 *
 * Refreshes the catalog from every enabled brand feed (feed_sources), nightly via
 * pg_cron (see docs/PRODUCT-FEEDS.md), or on demand. Optional JSON body:
 * { "source": "awin-88509" } to import one store.
 *
 * Deploy with JWT verification OFF; it is protected by IMPORT_FEEDS_SECRET instead
 * (sent as the `x-import-secret` header). Deploy the bundled single file
 * supabase/dashboard/import-feeds.ts (npm run bundle-import), not this folder.
 *
 * Secrets (Supabase dashboard > Edge Functions > Secrets; never in the app or the repo):
 *   AWIN_API_KEY          your Awin product-feed key (Create-a-Feed), for classic-format feeds
 *   AWIN_GOOGLE_FEED_URL  the Create-a-Feed download link for your Google-format feeds (CSV, gzip).
 *                         One file holds every store you selected; feed ids like "F1067" use it.
 *   IMPORT_FEEDS_SECRET   long random string; the nightly job sends it
 * Provided automatically by Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { gunzipSync } from 'node:zlib';

import { AWIN_COLUMNS, type Probe } from '../../../src/feeds/index.ts';
import { runImports, type FeedSource, type ImportDeps, type ProductRow, type RunResult } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AWIN_KEY = Deno.env.get('AWIN_API_KEY') ?? '';
const SECRET = Deno.env.get('IMPORT_FEEDS_SECRET') ?? '';
const GOOGLE_FEED_URL = Deno.env.get('AWIN_GOOGLE_FEED_URL') ?? '';

/** Google-format feeds have ids like "F1067"; classic ones are plain numbers. */
const isGoogleFeed = (source: FeedSource) => /^F\d+$/i.test(source.feed_id.trim());

/** The combined Google-format file, downloaded once per run (Awin limits repeat downloads). */
let googleFeed: Promise<string> | null = null;
function downloadGoogleFeed(): Promise<string> {
  if (!GOOGLE_FEED_URL) throw new Error('AWIN_GOOGLE_FEED_URL secret is not set.');
  googleFeed ??= (async () => {
    const res = await fetch(GOOGLE_FEED_URL, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Awin feed download failed (${res.status}). Check AWIN_GOOGLE_FEED_URL.`);
    return gunzipText(res);
  })();
  // A failed download is retried by the next store instead of being remembered.
  googleFeed.catch(() => (googleFeed = null));
  return googleFeed;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
  });
  if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** Awin's product-feed download address for one feed, as CSV in gzip. */
function awinFeedUrl(source: FeedSource): string {
  const cols = AWIN_COLUMNS.join(',');
  return (
    `https://productdata.awin.com/datafeed/download/apikey/${encodeURIComponent(AWIN_KEY)}` +
    `/language/en/fid/${encodeURIComponent(source.feed_id)}/columns/${cols}` +
    `/format/csv/delimiter/%2C/compression/gzip/adultcontent/0/`
  );
}

/**
 * Feed text from a download, unzipping gzip when needed. Awin's gzip files are many
 * gzip members glued together; the web DecompressionStream stops with "failed to write
 * whole buffer" on those, so this uses node:zlib, which reads every member.
 */
async function gunzipText(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  if (!gz) return new TextDecoder().decode(buf);
  return new TextDecoder().decode(gunzipSync(buf));
}

const probe: Probe = async (url, kind) => {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'CureAvo-feed-check/1.0', ...(kind === 'image' ? { Range: 'bytes=0-65535' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const len = res.headers.get('content-range')?.split('/')[1] ?? res.headers.get('content-length');
  // Read (a little of) the body so connections are released.
  const body = await res.arrayBuffer();
  return {
    ok: res.ok,
    status: res.status,
    finalUrl: res.url,
    contentType: res.headers.get('content-type') ?? '',
    size: len && len !== '*' ? Number(len) : kind === 'image' ? body.byteLength : null,
  };
};

const deps: ImportDeps = {
  async listSources(onlyId) {
    const filter = onlyId ? `&id=eq.${encodeURIComponent(onlyId)}` : '';
    return (await rest(`feed_sources?select=*${filter}&order=id`)).json();
  },
  async download(source) {
    if (isGoogleFeed(source)) return downloadGoogleFeed();
    if (!AWIN_KEY) throw new Error('AWIN_API_KEY secret is not set.');
    const res = await fetch(awinFeedUrl(source), { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Awin feed download failed (${res.status}). Check the feed id and AWIN_API_KEY.`);
    return gunzipText(res);
  },
  async saveRetailer(source) {
    await rest('retailers?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify({ id: source.id, name: source.name, domain: source.domain }),
    });
  },
  async upsertProducts(rows: ProductRow[]) {
    await rest('products?on_conflict=id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: JSON.stringify(rows),
    });
  },
  async deactivateStale(retailerId, before) {
    const res = await rest(
      `products?retailer_id=eq.${encodeURIComponent(retailerId)}&is_active=eq.true&updated_at=lt.${encodeURIComponent(before)}`,
      { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ is_active: false }) },
    );
    return ((await res.json()) as unknown[]).length;
  },
  async startRun(sourceId) {
    const res = await rest('import_runs?select=id', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({ source_id: sourceId }),
    });
    return ((await res.json()) as { id: string }[])[0].id;
  },
  async finishRun(runId, r: RunResult) {
    await rest(`import_runs?id=eq.${runId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        status: r.status,
        imported: r.imported ?? null,
        deactivated: r.deactivated ?? null,
        report: r.report ?? null,
        error: r.error ?? null,
      }),
    });
  },
  probe,
  now: () => new Date(),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!SECRET || req.headers.get('x-import-secret') !== SECRET) return json(401, { error: 'Not allowed.' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase settings missing.' });
  let only: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { source?: unknown };
    if (typeof body.source === 'string') only = body.source;
  } catch {
    // No body: import every store.
  }
  const results = await runImports(deps, only);
  // Summary only: the full report is saved in import_runs.
  return json(
    200,
    results.map(({ source, result }) => ({
      source,
      status: result.status,
      imported: result.imported,
      deactivated: result.deactivated,
      error: result.error,
    })),
  );
});
