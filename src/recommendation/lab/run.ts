/**
 * Engine Lab runner: every scenario × policy × catalog seed × shopper, with paired comparisons.
 * Pure (no file system, no network); the CLI in scripts/engine-lab.ts prints and saves results.
 */
import { buildLabCatalog, type CatalogConfig, type LabCatalog } from './catalog';
import { bigStoreShare, estimate, median, pairedDifference, quantile, sessionMetrics, type Estimate } from './metrics';
import { POLICIES } from './policies';
import { runLabSession, type SessionLog } from './session';
import { makeShopper, type ShopperKind } from './shoppers';

export interface Scenario {
  id: string;
  title: string;
  /** What this scenario is meant to reveal. */
  question: string;
  shopper: ShopperKind;
  catalog: Partial<Omit<CatalogConfig, 'seed'>>;
  /** Metrics to put in this scenario's headline table. */
  headline: string[];
}

const CORE = ['relevance@1-10', 'relevance@11-20', 'relevance@41-60', 'firstLove', 'loveFound', 'loves@20'];

export const SCENARIOS: Scenario[] = [
  { id: 'S01-cold', title: 'No onboarding', question: 'How fast does V2 learn from nothing?', shopper: 'cold', catalog: {}, headline: [...CORE, 'families@20', 'retailers@20'] },
  { id: 'S02-knows-style', title: 'Knows their style', question: 'Do correct style picks help the first cards?', shopper: 'knows-style', catalog: {}, headline: CORE },
  { id: 'S03-two-tastes', title: 'Two distinct aesthetics', question: 'Does V2 keep both tastes alive, or collapse to one?', shopper: 'two-tastes', catalog: {}, headline: [...CORE, 'families@20'] },
  { id: 'S04-category-split', title: 'Different taste per type (nightstands → sofas)', question: 'Does nightstand taste wrongly carry over to sofas?', shopper: 'category-split', catalog: {}, headline: ['relevance@1-10', 'relevance@11-20', 'relevance@31-40', 'relevance@41-60', 'loveFound'] },
  { id: 'S05-taste-shift', title: 'Taste changes mid-session (swipe 30)', question: 'How quickly does V2 follow a change of mind?', shopper: 'taste-shift', catalog: {}, headline: ['relevance@11-20', 'relevance@21-40', 'relevance@31-40', 'relevance@41-60', 'loveFound'] },
  { id: 'S06-visual-only', title: 'Taste in untagged visual traits', question: 'What happens when taste lives in shape, weight and finish, which no tag describes?', shopper: 'visual-only', catalog: {}, headline: CORE },
  { id: 'S07-hidden-gem', title: 'Hidden gem (long-tail design, small store, generic tags)', question: 'Can V2 surface a design its vocabulary has no word for?', shopper: 'hidden-gem', catalog: {}, headline: [...CORE, 'gemFound', 'firstDeckGemRank'] },
  { id: 'S08-strict-budget', title: 'Strict budget (stated in Profile)', question: 'Does V2 respect an explicit budget?', shopper: 'strict-budget', catalog: {}, headline: [...CORE, 'overBudget'] },
  { id: 'S09-noisy-labels', title: '35% wrong or missing labels', question: 'How fragile is V2 to bad metadata?', shopper: 'cold', catalog: { labelNoise: 0.35 }, headline: CORE },
  { id: 'S10-near-duplicates', title: 'Many near-duplicate variants (6 per design)', question: 'Does the deck repeat the same design?', shopper: 'cold', catalog: { variantsPerDesign: 6 }, headline: [...CORE, 'nearDup', 'families@20'] },
  { id: 'S11-store-imbalance', title: 'One store lists ~70% of the catalog', question: 'Do small stores get seen?', shopper: 'cold', catalog: { retailerMix: 'dominant' }, headline: [...CORE, 'retailers@20', 'bigStore@20', 'gemFound'] },
  { id: 'S12-wrong-onboarding', title: 'Onboarding picks the wrong style', question: 'Can V2 recover from a wrong early assumption?', shopper: 'wrong-onboarding', catalog: {}, headline: [...CORE, 'recovery'] },
  { id: 'S13-scale-1k', title: 'Scale: 1,000-product catalog', question: 'Quality and speed with a small catalog', shopper: 'cold', catalog: { size: 1000 }, headline: CORE },
  { id: 'S14-scale-10k', title: 'Scale: 10,000-product catalog', question: 'Quality and speed with a large catalog (batches + refill)', shopper: 'cold', catalog: { size: 10000 }, headline: CORE },
];

export interface LabOptions {
  shoppers: number;
  catalogSeeds: number[];
  policies: string[];
  scenarios: string[];
  /** Default catalog size (scenarios may override). */
  size: number;
  swipes: number;
  onProgress?: (msg: string) => void;
}

export const DEFAULT_OPTIONS: LabOptions = {
  shoppers: 30,
  catalogSeeds: [1, 2, 3],
  policies: ['v2', 'random', 'content', 'oracle'],
  scenarios: SCENARIOS.map((s) => s.id),
  size: 3000,
  swipes: 60,
};

export interface PolicyResult {
  metrics: Record<string, Estimate>;
  /** Paired difference vs random, same shoppers and catalogs. */
  vsRandom: Record<string, Estimate>;
  /** Share of the eligible type that ever entered a candidate batch / was ever shown. */
  coverage: { batched: number; shown: number };
  timings: { rankMedianMs: number; rankP95Ms: number; rerankMedianMs: number; rerankP95Ms: number; selectMedianMs: number };
  sessions: number;
}

export interface ScenarioResult {
  id: string;
  title: string;
  question: string;
  headline: string[];
  catalogSize: number;
  policies: Record<string, PolicyResult>;
}

export interface LabResults {
  options: Omit<LabOptions, 'onProgress'>;
  scenarios: ScenarioResult[];
}

/** Metrics compared against random in every scenario. */
const PAIRED = ['relevance@1-10', 'relevance@11-20', 'relevance@41-60', 'firstLove', 'loves@20', 'gemFound'];

export function runLab(input: Partial<LabOptions> = {}): LabResults {
  const opts = { ...DEFAULT_OPTIONS, ...input };
  const catalogs = new Map<string, LabCatalog>();
  const catalogFor = (cfg: CatalogConfig) => {
    const key = JSON.stringify(cfg);
    let c = catalogs.get(key);
    if (!c) {
      c = buildLabCatalog(cfg);
      catalogs.set(key, c);
    }
    return c;
  };

  const out: ScenarioResult[] = [];
  for (const scenario of SCENARIOS.filter((s) => opts.scenarios.includes(s.id))) {
    const size = scenario.catalog.size ?? opts.size;
    const perPolicy = new Map<string, { logs: SessionLog[]; values: Map<string, Map<string, number>>; catalogs: LabCatalog[] }>();
    for (const name of opts.policies) {
      const policy = POLICIES[name];
      if (!policy) throw new Error(`Unknown policy ${name}`);
      const logs: SessionLog[] = [];
      const values = new Map<string, Map<string, number>>();
      const used: LabCatalog[] = [];
      for (const seed of opts.catalogSeeds) {
        const catalog = catalogFor({ ...scenario.catalog, size, seed });
        used.push(catalog);
        for (let i = 0; i < opts.shoppers; i++) {
          const shopper = makeShopper(scenario.shopper, i, catalog);
          const log = runLabSession(policy, shopper, catalog);
          logs.push(log);
          const m = { ...sessionMetrics(log, opts.swipes), 'bigStore@20': bigStoreShare(log, catalog.retailerShare) };
          const key = `${seed}:${shopper.id}`;
          for (const [k, v] of Object.entries(m)) {
            if (!values.has(k)) values.set(k, new Map());
            values.get(k)!.set(key, v);
          }
        }
      }
      perPolicy.set(name, { logs, values, catalogs: used });
      opts.onProgress?.(`${scenario.id} · ${name}: ${logs.length} sessions`);
    }

    const random = perPolicy.get('random');
    const policies: Record<string, PolicyResult> = {};
    for (const [name, { logs, values, catalogs: used }] of perPolicy) {
      const metrics: Record<string, Estimate> = {};
      for (const [k, byKey] of values) {
        const vals = [...byKey.values()];
        // Rank of the first hidden gem is a median (Infinity = none), not a mean.
        metrics[k] =
          k === 'firstDeckGemRank'
            ? { mean: median(vals.map((v) => (Number.isFinite(v) ? v : 1e9))), lo: NaN, hi: NaN, n: vals.length }
            : estimate(vals, 7);
      }
      const vsRandom: Record<string, Estimate> = {};
      if (random && name !== 'random') for (const k of PAIRED) vsRandom[k] = pairedDifference(values.get(k)!, random.values.get(k)!);
      // Coverage of the first phase's type, per catalog seed, averaged.
      const covB: number[] = [];
      const covS: number[] = [];
      used.forEach((catalog, ci) => {
        const seedLogs = logs.filter((l) => l.catalogSeed === catalog.config.seed);
        const type = seedLogs[0]?.exposures[0]?.subcategoryId ?? 'nightstands';
        const eligible = catalog.products.filter((p) => p.subcategoryId === type && catalog.truth.get(p.id)!.active);
        const batched = new Set(seedLogs.flatMap((l) => [...l.batched]));
        const shown = new Set(seedLogs.flatMap((l) => l.exposures.map((e) => e.productId)));
        covB.push(eligible.filter((p) => batched.has(p.id)).length / eligible.length);
        covS.push(eligible.filter((p) => shown.has(p.id)).length / eligible.length);
        void ci;
      });
      const all = (f: (l: SessionLog) => number[]) => logs.flatMap(f);
      policies[name] = {
        metrics,
        vsRandom,
        coverage: { batched: covB.reduce((a, b) => a + b, 0) / covB.length, shown: covS.reduce((a, b) => a + b, 0) / covS.length },
        timings: {
          rankMedianMs: median(all((l) => l.timings.rankMs)),
          rankP95Ms: quantile(all((l) => l.timings.rankMs), 0.95),
          rerankMedianMs: median(all((l) => l.timings.rerankMs)),
          rerankP95Ms: quantile(all((l) => l.timings.rerankMs), 0.95),
          selectMedianMs: median(all((l) => l.timings.selectMs)),
        },
        sessions: logs.length,
      };
    }
    out.push({ id: scenario.id, title: scenario.title, question: scenario.question, headline: scenario.headline, catalogSize: size, policies });
  }
  const { onProgress: _p, ...rest } = opts;
  void _p;
  return { options: rest, scenarios: out };
}

/** The deterministic part of the results (everything except timings), for reproducibility checks. */
export function qualityOnly(results: LabResults): unknown {
  return results.scenarios.map((s) => ({
    id: s.id,
    policies: Object.fromEntries(Object.entries(s.policies).map(([k, v]) => [k, { metrics: v.metrics, vsRandom: v.vsRandom, coverage: v.coverage }])),
  }));
}
