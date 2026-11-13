/// <reference types="node" />
/**
 * CureAvo Engine Lab: offline, reproducible evaluation of discovery policies (no app, no network,
 * no real users). Synthetic shoppers on synthetic catalogs; see docs/ENGINE_LAB_BASELINE.md.
 *
 *   npm run engine-lab                        full baseline (30 shoppers × 3 catalogs per scenario, ~15 min)
 *   npm run engine-lab -- --quick             fast smoke run (4 shoppers × 1 catalog)
 *   npm run engine-lab -- --scenarios S01-cold,S07-hidden-gem --policies v2,random
 *   npm run engine-lab -- --out docs/engine-lab/v2-baseline.json
 *   npm run engine-lab -- --perf              performance only (timings + memory at 1k/3k/10k)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildLabCatalog } from '../src/recommendation/lab/catalog';
import { DEFAULT_OPTIONS, runLab, SCENARIOS, type LabResults } from '../src/recommendation/lab/run';
import { POLICIES } from '../src/recommendation/lab/policies';
import { runLabSession } from '../src/recommendation/lab/session';
import { makeShopper } from '../src/recommendation/lab/shoppers';
import { median, quantile } from '../src/recommendation/lab/metrics';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function fmt(metric: string, v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (metric === 'firstDeckGemRank') return v >= 1e9 ? 'none' : String(Math.round(v + 1));
  if (metric.startsWith('relevance') || metric.startsWith('keep') || ['loveFound', 'gemFound', 'nearDup', 'overBudget', 'bigStore@20'].includes(metric))
    return metric.startsWith('relevance') ? v.toFixed(2) : `${Math.round(v * 100)}%`;
  return v.toFixed(1);
}

function markdown(results: LabResults): string {
  const lines: string[] = [];
  for (const s of results.scenarios) {
    const names = Object.keys(s.policies);
    lines.push(`### ${s.id} · ${s.title}`, '', `_${s.question}_ · catalog ${s.catalogSize.toLocaleString('en-US')} · ${s.policies[names[0]!]!.sessions} sessions per policy`, '');
    lines.push(`| Metric | ${names.join(' | ')} |`, `| --- | ${names.map(() => '---').join(' | ')} |`);
    for (const m of s.headline) {
      const cells = names.map((n) => {
        const e = s.policies[n]!.metrics[m];
        if (!e) return '—';
        const ci = Number.isFinite(e.lo) && e.lo !== e.hi ? ` (${fmt(m, e.lo)}–${fmt(m, e.hi)})` : '';
        return `${fmt(m, e.mean)}${ci}`;
      });
      lines.push(`| ${m} | ${cells.join(' | ')} |`);
    }
    const v2 = s.policies.v2;
    if (v2 && Object.keys(v2.vsRandom).length) {
      const d = v2.vsRandom;
      const show = (k: string) => (d[k] && Number.isFinite(d[k]!.mean) ? `${d[k]!.mean >= 0 ? '+' : ''}${d[k]!.mean.toFixed(k.startsWith('relevance') ? 3 : 2)} (${d[k]!.lo.toFixed(2)} to ${d[k]!.hi.toFixed(2)})` : '—');
      lines.push('', `V2 − random (paired): relevance@1-10 ${show('relevance@1-10')}; relevance@41-60 ${show('relevance@41-60')}; firstLove ${show('firstLove')} swipes; gemFound ${show('gemFound')}`);
    }
    if (v2) lines.push(`Coverage (V2): ${Math.round(v2.coverage.batched * 100)}% of the eligible type entered a candidate batch, ${Math.round(v2.coverage.shown * 100)}% was shown across all sessions.`);
    lines.push('');
  }
  // Reliability across every scenario: these must all be zero for every policy.
  const names = Object.keys(results.scenarios[0]?.policies ?? {});
  lines.push('### Reliability (all scenarios)', '', '| Policy | sessions | ineligible cards | repeated cards | decks run dry with products left |', '| --- | --- | --- | --- | --- |');
  for (const n of names) {
    let sessions = 0;
    let inel = 0;
    let dup = 0;
    let ex = 0;
    for (const s of results.scenarios) {
      const r = s.policies[n]!;
      sessions += r.sessions;
      inel += (r.metrics.ineligible?.mean ?? 0) * r.sessions;
      dup += (r.metrics.dupExposure?.mean ?? 0) * r.sessions;
      ex += (r.metrics.exhausted?.mean ?? 0) * r.sessions;
    }
    lines.push(`| ${n} | ${sessions} | ${Math.round(inel)} | ${Math.round(dup)} | ${Math.round(ex)} |`);
  }
  return lines.join('\n');
}

function perf() {
  console.log('\nPerformance (V2, one session = 60 swipes on nightstands; Node, this machine)\n');
  console.log('| Catalog | nightstands | rank median / p95 (ms) | re-rank median / p95 (ms) | candidate select median (ms) | session (ms) | heap Δ (MB) |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const size of [1000, 3000, 10000]) {
    const catalog = buildLabCatalog({ size, seed: 1 });
    const rank: number[] = [];
    const rerank: number[] = [];
    const select: number[] = [];
    const sessions: number[] = [];
    global.gc?.();
    const heap0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      const log = runLabSession(POLICIES.v2!, makeShopper('cold', i, catalog), catalog);
      sessions.push(performance.now() - t0);
      rank.push(...log.timings.rankMs);
      rerank.push(...log.timings.rerankMs);
      select.push(...log.timings.selectMs);
    }
    const heap = (process.memoryUsage().heapUsed - heap0) / 1e6;
    const n = catalog.products.filter((p) => p.subcategoryId === 'nightstands').length;
    const f = (x: number) => x.toFixed(1);
    console.log(
      `| ${size.toLocaleString('en-US')} | ${n} | ${f(median(rank))} / ${f(quantile(rank, 0.95))} | ${f(median(rerank))} / ${f(quantile(rerank, 0.95))} | ${f(median(select))} | ${f(median(sessions))} | ${heap.toFixed(1)} |`,
    );
  }
}

if (flag('perf')) {
  perf();
} else {
  const quick = flag('quick');
  const opts = {
    ...DEFAULT_OPTIONS,
    shoppers: Number(value('shoppers') ?? (quick ? 4 : DEFAULT_OPTIONS.shoppers)),
    catalogSeeds: (value('seeds') ?? (quick ? '1' : DEFAULT_OPTIONS.catalogSeeds.join(','))).split(',').map(Number),
    policies: (value('policies') ?? DEFAULT_OPTIONS.policies.join(',')).split(','),
    scenarios: value('scenarios')?.split(',') ?? SCENARIOS.map((s) => s.id),
  };
  const t0 = Date.now();
  const results = runLab({ ...opts, onProgress: (m) => process.stderr.write(`  ${m} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`) });
  console.log(markdown(results));
  const out = value('out');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(results, (_k, v) => (Number.isFinite(v) || typeof v !== 'number' ? v : null), 2));
    console.log(`Saved ${out}`);
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
}
