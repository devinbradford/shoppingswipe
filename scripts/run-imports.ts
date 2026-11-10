/// <reference types="node" />
/**
 * The nightly product import, run by GitHub Actions (.github/workflows/import-feeds.yml).
 * Same engine as the Supabase Edge Function, without its tight CPU/memory limits.
 *
 *   npx tsx scripts/run-imports.ts [awin-92307]     (one store, or all enabled stores)
 *
 * Reads from the environment (GitHub repository secrets; never commit these):
 *   SUPABASE_URL           https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY    Supabase secret key (sb_secret_…) or legacy service_role key
 *   AWIN_GOOGLE_FEED_URL   Create-a-Feed download link for Google-format feeds
 *   AWIN_API_KEY           optional, for classic-format feeds
 *   SHARP_DIR              optional, folder where the workflow installed `sharp` for photo
 *                          measuring (without it, photos aren't measured and the app shows them whole)
 * Exits with an error if any store fails, so GitHub marks the run red and emails you.
 */
import { runImports } from '../supabase/functions/import-feeds/handler';
import { loadSharp, makePhotoMeasurer } from '../supabase/functions/import-feeds/photos.node';
import { makeDeps } from '../supabase/functions/import-feeds/supabase';

const env = (name: string) => (process.env[name] ?? '').trim();

async function main() {
  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error(
      'SUPABASE_URL and SUPABASE_SECRET_KEY must be set (GitHub: Settings > Secrets and variables > Actions).',
    );
    process.exit(1);
  }
  const only = process.argv[2]?.trim() || undefined;
  const deps = makeDeps({
    supabaseUrl,
    serviceKey,
    googleFeedUrl: env('AWIN_GOOGLE_FEED_URL') || undefined,
    awinKey: env('AWIN_API_KEY') || undefined,
  });
  const sharp = loadSharp();
  if (sharp) deps.measurePhoto = makePhotoMeasurer(sharp);
  else console.log('Photo measuring skipped: sharp is not installed (set SHARP_DIR).');
  const started = Date.now();
  const results = await runImports(deps, only);
  if (results.length === 0) {
    console.error(only ? `No enabled store with id ${only} in feed_sources.` : 'No enabled stores in feed_sources.');
    process.exit(1);
  }
  for (const { source, result } of results) {
    if (result.status === 'ok') {
      const r = result.report!;
      console.log(`✔ ${source}: ${result.imported} imported, ${result.deactivated} hidden`);
      console.log(`    feed rows ${r.rows}, products ${r.products}, skipped ${JSON.stringify(r.skipped)}`);
      if (r.photos)
        console.log(
          r.photos.skipped
            ? `    photos not measured: ${r.photos.skipped}`
            : `    photos measured ${r.photos.measured}, reused ${r.photos.reused}, failed ${r.photos.failed}; cut-outs ${r.photos.cutouts}, trimmed ${r.photos.trimmed} ${JSON.stringify(r.photos.notes)}`,
        );
      if (r.pageCheck)
        console.log(
          `    store pages checked ${r.pageCheck.checked}/${r.pageCheck.sampled}, broken ${r.pageCheck.broken}`,
        );
    } else {
      console.log(`✘ ${source}: ${result.error}`);
    }
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s.`);
  if (results.some((r) => r.result.status !== 'ok')) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
