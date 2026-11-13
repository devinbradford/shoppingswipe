/**
 * Engine Lab correctness: the fixtures are deterministic and honest, shoppers' tastes don't
 * depend on V2's tags, sessions follow the production pipeline, metrics are computed as defined,
 * and the V2 baseline is pinned (a change to V2's behaviour fails the golden test on purpose).
 */
import { CANDIDATE_POOL_SIZE } from '@/lib/candidatePool';
import { buildLabCatalog, FAMILIES, UNTAGGED_DIMS, VISUAL_DIMS } from '../lab/catalog';
import { estimate, pairedDifference, sessionMetrics } from '../lab/metrics';
import { POLICIES, v2Policy } from '../lab/policies';
import { qualityOnly, runLab } from '../lab/run';
import { runLabSession, type SessionLog } from '../lab/session';
import { makeShopper, utility } from '../lab/shoppers';
import { buildTasteModel } from '../model';
import { rankDeck } from '../rank';
import { computePriceBands } from '../engine';

const catalog = buildLabCatalog({ size: 1000, seed: 1 });

describe('lab catalogs', () => {
  it('are deterministic and exactly the requested size', () => {
    const again = buildLabCatalog({ size: 1000, seed: 1 });
    expect(again.products).toEqual(catalog.products);
    expect(catalog.products).toHaveLength(1000);
    expect(buildLabCatalog({ size: 1000, seed: 2 }).products).not.toEqual(catalog.products);
  });

  it('are obviously fictional', () => {
    for (const p of catalog.products) expect(new URL(p.productUrl).hostname.endsWith('.example.com')).toBe(true);
  });

  it('carry the configured label noise, duplicates, store mix and inactive share', () => {
    const tagged = catalog.products.filter((p) => !FAMILIES.find((f) => f.id === catalog.truth.get(p.id)!.family)!.untaggable);
    const wrong = tagged.filter((p) => !p.styleTags.includes(FAMILIES.find((f) => f.id === catalog.truth.get(p.id)!.family)!.styleTag));
    expect(wrong.length / tagged.length).toBeGreaterThan(0.06);
    expect(wrong.length / tagged.length).toBeLessThan(0.2);
    const dups = buildLabCatalog({ size: 600, seed: 1, variantsPerDesign: 6 });
    expect(new Set([...dups.truth.values()].map((t) => t.designId)).size).toBe(100);
    const dom = buildLabCatalog({ size: 2000, seed: 1, retailerMix: 'dominant' });
    expect(dom.retailerShare.get('lab-r1')).toBeGreaterThan(0.6);
    const inactive = [...catalog.truth.values()].filter((t) => !t.active).length / 1000;
    expect(inactive).toBeGreaterThan(0.01);
    expect(inactive).toBeLessThan(0.06);
  });

  it('label designs V2 has no word for as "modern", like the importer', () => {
    const sculptural = catalog.products.filter((p) => catalog.truth.get(p.id)!.family === 'sculptural');
    expect(sculptural.length).toBeGreaterThan(5);
    expect(sculptural.every((p) => !p.styleTags.includes('sculptural'))).toBe(true);
  });

  it('has visual dimensions no tag describes', () => {
    expect(UNTAGGED_DIMS.every((d) => VISUAL_DIMS.includes(d))).toBe(true);
  });
});

describe('lab shoppers', () => {
  const p = catalog.products.find((x) => x.subcategoryId === 'nightstands')!;

  it("judge the hidden design, not V2's tags: relabelling a product changes nothing", () => {
    const s = makeShopper('cold', 0, catalog);
    const relabelled = { ...p, styleTags: ['industrial'], material: 'steel', color: 'black', brand: 'Other' };
    expect(utility(s, relabelled, catalog, 0)).toBe(utility(s, p, catalog, 0));
  });

  it('are deterministic', () => {
    expect(makeShopper('two-tastes', 3, catalog)).toEqual(makeShopper('two-tastes', 3, catalog));
  });

  it('visual-only shoppers ignore warmth, ornament and texture', () => {
    const s = makeShopper('visual-only', 0, catalog);
    expect(s.prototypes[0]!.mask).toEqual([0, 1, 1, 0, 0, 1]);
  });

  it('a strict budget makes over-budget pieces unacceptable', () => {
    const s = makeShopper('strict-budget', 0, catalog);
    const over = catalog.products.find((x) => x.subcategoryId === 'nightstands' && x.priceCents > s.budget!.maxCents)!;
    const cheap = { ...over, priceCents: s.budget!.maxCents };
    expect(utility(s, over, catalog, 0)).toBeCloseTo(utility(s, cheap, catalog, 0) - 3, 6);
  });
});

describe('lab sessions follow the production pipeline', () => {
  const shopper = makeShopper('cold', 1, catalog);
  const log = runLabSession(v2Policy, shopper, catalog);

  it('only ever show active, not-yet-swiped products of the deck type, each once', () => {
    expect(log.exposures).toHaveLength(60);
    expect(log.exposures.every((e) => !e.ineligible)).toBe(true);
    expect(new Set(log.exposures.map((e) => e.productId)).size).toBe(60);
    expect(log.exposures.every((e) => e.subcategoryId === 'nightstands')).toBe(true);
  });

  it('draw candidate batches no larger than the app does', () => {
    const big = buildLabCatalog({ size: 10000, seed: 1 });
    const l = runLabSession(POLICIES.random!, makeShopper('cold', 0, big), big);
    const nightstands = big.products.filter((p) => p.subcategoryId === 'nightstands' && big.truth.get(p.id)!.active).length;
    expect(nightstands).toBeGreaterThan(CANDIDATE_POOL_SIZE);
    expect(l.batched.size).toBe(CANDIDATE_POOL_SIZE);
  });

  it("V2's first deck is exactly what rankDeck gives for the same batch and seed", () => {
    const active = catalog.products.filter((p) => catalog.truth.get(p.id)!.active);
    const bands = computePriceBands(active);
    const batch = active.filter((p) => p.subcategoryId === 'nightstands');
    const model = buildTasteModel({ swipes: [], products: new Map(batch.map((p) => [p.id, p])), bands, signals: [], feedback: [], seedStyles: [], statedBudget: null });
    const direct = rankDeck(batch, model, { bands, seed: 42 }).map((r) => r.product.id);
    const viaLab = v2Policy.rank(batch, { swipes: [], signals: [], known: new Map(batch.map((p) => [p.id, p])), bands, statedStyles: [], statedBudget: null }, 42).map((p) => p.id);
    expect(viaLab).toEqual(direct);
  });

  it('end when every eligible product has been swiped, without calling it running dry', () => {
    const tiny = buildLabCatalog({ size: 60, seed: 3 });
    const l = runLabSession(v2Policy, makeShopper('cold', 0, tiny), tiny);
    const eligible = tiny.products.filter((p) => p.subcategoryId === 'nightstands' && tiny.truth.get(p.id)!.active).length;
    expect(l.exposures).toHaveLength(eligible);
    expect(l.exhausted).toBe(false);
  });

  it('are deterministic', () => {
    expect(runLabSession(v2Policy, shopper, catalog).exposures).toEqual(log.exposures);
  });
});

describe('lab metrics', () => {
  const fake = (percentiles: number[], loves: number[] = []): SessionLog => ({
    shopperId: 'x',
    policy: 'p',
    catalogSeed: 1,
    lovesAvailable: true,
    gemsAvailable: false,
    exhausted: false,
    batched: new Set(),
    firstDeckGemRank: Infinity,
    timings: { rankMs: [], rerankMs: [], selectMs: [] },
    exposures: percentiles.map((pc, i) => ({
      productId: `p${i}`,
      swipe: i,
      phase: 0,
      subcategoryId: 'nightstands',
      u: pc,
      percentile: pc,
      love: loves.includes(i),
      gem: false,
      kept: pc > 0.8,
      family: i % 2 ? 'a' : 'b',
      designId: `d${i % 3}`,
      retailerId: 'r',
      styleTags: ['s'],
      overBudget: false,
      ineligible: false,
    })),
  });

  it('compute relevance windows, first love (1-based) and censoring as defined', () => {
    const m = sessionMetrics(fake([...Array(10).fill(0.2), ...Array(50).fill(0.9)], [12]), 60);
    expect(m['relevance@1-10']).toBeCloseTo(0.2);
    expect(m['relevance@11-20']).toBeCloseTo(0.9);
    expect(m.firstLove).toBe(13);
    expect(m.loveFound).toBe(1);
    expect(sessionMetrics(fake(Array(60).fill(0.5)), 60).firstLove).toBe(61);
  });

  it('count recovery and near-duplicates', () => {
    const m = sessionMetrics(fake([...Array(20).fill(0.1), ...Array(40).fill(0.95)]), 60);
    expect(m.recovery).toBeGreaterThan(20);
    expect(m.recovery).toBeLessThan(31);
    expect(m.nearDup).toBeGreaterThan(0.9); // designs repeat every 3 cards
    expect(m['families@20']).toBe(2);
  });

  it('give deterministic bootstrap intervals that contain the mean', () => {
    const xs = Array.from({ length: 50 }, (_, i) => (i % 7) / 7);
    const e = estimate(xs, 3);
    expect(estimate(xs, 3)).toEqual(e);
    expect(e.lo).toBeLessThanOrEqual(e.mean);
    expect(e.hi).toBeGreaterThanOrEqual(e.mean);
    const d = pairedDifference(new Map([['a', 2], ['b', 3]]), new Map([['a', 1], ['b', 1]]));
    expect(d.mean).toBe(1.5);
  });
});

describe('the lab as a whole', () => {
  const small = { shoppers: 3, catalogSeeds: [1], scenarios: ['S01-cold', 'S08-strict-budget'], size: 1000 };

  it('is reproducible run to run (timings aside)', () => {
    expect(qualityOnly(runLab(small))).toEqual(qualityOnly(runLab(small)));
  });

  it('sanity: the oracle beats V2, which beats random later in the session; nothing ineligible is shown', () => {
    const r = runLab({ ...small, shoppers: 6 });
    for (const s of r.scenarios) {
      const m = (p: string, k: string) => s.policies[p]!.metrics[k]!.mean;
      expect(m('oracle', 'relevance@1-10')).toBeGreaterThan(0.9);
      expect(m('random', 'relevance@41-60')).toBeGreaterThan(0.3);
      expect(m('random', 'relevance@41-60')).toBeLessThan(0.7);
      for (const p of Object.keys(s.policies)) {
        expect(m(p, 'ineligible')).toBe(0);
        expect(m(p, 'dupExposure')).toBe(0);
      }
    }
  });

  it('GOLDEN: the V2 baseline is pinned (a change to V2 ranking or learning changes these on purpose)', () => {
    const r = runLab({ shoppers: 3, catalogSeeds: [1], scenarios: ['S01-cold', 'S07-hidden-gem'], policies: ['v2'], size: 1000 });
    const pinned = r.scenarios.map((s) => ({
      id: s.id,
      ...Object.fromEntries(
        ['relevance@1-10', 'relevance@41-60', 'firstLove', 'loves@20'].map((k) => [k, Number(s.policies.v2!.metrics[k]!.mean.toFixed(6))]),
      ),
    }));
    expect(pinned).toMatchSnapshot();
  });
});
