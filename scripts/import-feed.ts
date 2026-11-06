/// <reference types="node" />
/**
 * Runs a downloaded product feed through the same import engine the nightly
 * Supabase job uses, and prints the report. Nothing is uploaded anywhere.
 *
 *   npm run import-feed -- path/to/feed.csv.gz --retailer awin-88509 [--check] [--out products.json] [--max 2000]
 *
 * --check   also confirms each photo loads and each store link still lands on the product
 * --out     writes the imported products as JSON (handy for previews; keep real data out of git)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { importFeed, parseCsv, type Probe } from '../src/feeds';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.match(/^--(retailer|out|max)$/));
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.error('Usage: npm run import-feed -- <feed.csv[.gz]> --retailer <id> [--check] [--out file.json] [--max N]');
  process.exit(1);
}

const raw = readFileSync(file);
const text = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');

const nodeProbe: Probe = async (url, kind) => {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'CureAvo-feed-check/1.0', ...(kind === 'image' ? { Range: 'bytes=0-65535' } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const len = res.headers.get('content-range')?.split('/')[1] ?? res.headers.get('content-length');
  const body = kind === 'image' ? await res.arrayBuffer() : null;
  return {
    ok: res.ok,
    status: res.status,
    finalUrl: res.url,
    contentType: res.headers.get('content-type') ?? '',
    size: len && len !== '*' ? Number(len) : body ? body.byteLength : null,
  };
};

(async () => {
  const rows = parseCsv(text);
  const retailerId = opt('retailer') ?? `awin-${rows[0]?.merchant_id ?? 'unknown'}`;
  const { products, report } = await importFeed(
    rows,
    { retailerId, network: 'awin' },
    { probe: args.includes('--check') ? nodeProbe : undefined, maxProducts: Number(opt('max') ?? 2000) },
  );
  console.log(`\n${rows[0]?.merchant_name ?? 'Feed'} (${retailerId})`);
  console.log(`  rows in feed:        ${report.rows}`);
  console.log(`  distinct products:   ${report.products}`);
  console.log(`  imported:            ${report.imported}`);
  for (const [reason, n] of Object.entries(report.skipped)) {
    console.log(
      `  skipped ${reason.padEnd(20)} ${n}   e.g. ${(report.examples[reason as keyof typeof report.examples] ?? []).slice(0, 2).join(' | ')}`,
    );
  }
  console.log('  by type:', report.byType);
  const out = opt('out');
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        products.map(({ merchantUrl: _m, ...p }) => p),
        null,
        1,
      ),
    );
    console.log(`  wrote ${products.length} products to ${out}`);
  }
})();
