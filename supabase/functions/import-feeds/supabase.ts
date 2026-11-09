/**
 * The nightly import's real-world connections: Supabase's database (PostgREST over fetch),
 * Awin downloads, and the photo/page checks. Shared by the GitHub Actions runner
 * (scripts/run-imports.ts, Node) and the Supabase Edge Function (index.ts, Deno).
 */
import { gunzipSync } from 'node:zlib';

import { AWIN_COLUMNS, type Probe } from '../../../src/feeds/index.ts';
import type { FeedSource, ImportDeps, ProductRow, RunResult } from './handler.ts';

export interface ImportConfig {
  supabaseUrl: string;
  /** Supabase secret key (sb_secret_…) or the legacy service_role key. Server-side only. */
  serviceKey: string;
  /** Create-a-Feed download link for Google-format feeds (feed ids like "F1067"). */
  googleFeedUrl?: string;
  /** Awin feed key, for classic-format feeds (plain-number feed ids). */
  awinKey?: string;
}

/** Google-format feeds have ids like "F1067"; classic ones are plain numbers. */
const isGoogleFeed = (source: FeedSource) => /^F\d+$/i.test(source.feed_id.trim());

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

export const probe: Probe = async (url, kind) => {
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

export function makeDeps(cfg: ImportConfig): ImportDeps {
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  // New-style keys (sb_secret_…) go in `apikey` only; legacy JWT keys also as a Bearer token.
  const isJwt = cfg.serviceKey.startsWith('eyJ');

  async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.serviceKey,
        ...(isJwt ? { Authorization: `Bearer ${cfg.serviceKey}` } : {}),
        'content-type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
    });
    if (!res.ok) throw new Error(`Database ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  }

  /** The combined Google-format file, downloaded once per run (Awin limits repeat downloads). */
  let googleFeed: Promise<string> | null = null;
  function downloadGoogleFeed(): Promise<string> {
    if (!cfg.googleFeedUrl) return Promise.reject(new Error('AWIN_GOOGLE_FEED_URL is not set.'));
    googleFeed ??= (async () => {
      const res = await fetch(cfg.googleFeedUrl!, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`Awin feed download failed (${res.status}). Check AWIN_GOOGLE_FEED_URL.`);
      return gunzipText(res);
    })();
    // A failed download is retried by the next store instead of being remembered.
    googleFeed.catch(() => (googleFeed = null));
    return googleFeed;
  }

  /** Awin's classic product-feed download address for one feed, as CSV in gzip. */
  function awinFeedUrl(source: FeedSource): string {
    const cols = AWIN_COLUMNS.join(',');
    return (
      `https://productdata.awin.com/datafeed/download/apikey/${encodeURIComponent(cfg.awinKey ?? '')}` +
      `/language/en/fid/${encodeURIComponent(source.feed_id)}/columns/${cols}` +
      `/format/csv/delimiter/%2C/compression/gzip/adultcontent/0/`
    );
  }

  return {
    async listSources(onlyId) {
      const filter = onlyId ? `&id=eq.${encodeURIComponent(onlyId)}` : '';
      return (await rest(`feed_sources?select=*${filter}&order=id`)).json();
    },
    async download(source) {
      if (isGoogleFeed(source)) return downloadGoogleFeed();
      if (!cfg.awinKey) throw new Error('AWIN_API_KEY is not set.');
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
}
