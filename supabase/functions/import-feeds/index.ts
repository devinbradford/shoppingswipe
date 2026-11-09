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
import { runImports } from './handler.ts';
import { makeDeps } from './supabase.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SECRET = Deno.env.get('IMPORT_FEEDS_SECRET') ?? '';

const deps = makeDeps({
  supabaseUrl: SUPABASE_URL,
  serviceKey: SERVICE_KEY,
  googleFeedUrl: Deno.env.get('AWIN_GOOGLE_FEED_URL'),
  awinKey: Deno.env.get('AWIN_API_KEY'),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
