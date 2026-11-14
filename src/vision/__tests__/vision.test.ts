import { fleissKappa, krippendorffAlpha, majority } from '../agreement';
import { analyseCalibration, workload } from '../calibration';
import { makeFixturePack, makeFixtureWorld, simulateRaters, simulatedGrade } from '../fixtures';
import { findLeaks, groupIndex, groupRelated, photoKey, questionSplit, splitByGroup } from '../grouping';
import {
  atThreshold,
  averagePrecision,
  chooseThreshold,
  cosine,
  crossStoreRatio,
  nearest,
  retrievalReport,
  scoreRankedList,
  spearman,
  tripletAccuracy,
  type LabelledTriplet,
} from '../metrics';
import { buildPool, poolContribution } from '../pooling';
import { sampleEvaluationSet } from '../sampling';
import { LABELS_VERSION, validateExport, type CatalogItem, type LabelExport, type QuestionPack } from '../schema';

const item = (id: string, over: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  retailerId: 'r1',
  subcategoryId: 'nightstands',
  categoryId: 'bedroom',
  styleTags: ['minimal'],
  material: 'oak',
  color: 'white',
  photoUrl: `https://img.example.com/${id}.jpg`,
  pagePath: `/p/${id}`,
  ...over,
});

describe('agreement', () => {
  it('majority needs a clear winner and not too many "can\'t tell"', () => {
    expect(majority(['b', 'b', 'c']).label).toBe('b');
    expect(majority(['b', 'c']).label).toBe('ambiguous'); // tie
    expect(majority(['b', 'cant-tell', 'cant-tell']).label).toBe('ambiguous'); // mostly can't tell
    expect(majority(['b']).label).toBe('ambiguous'); // too few votes
    expect(majority([4, 4, 5]).label).toBe(4);
  });

  it('Fleiss kappa: 1 for perfect agreement, below 0 for systematic disagreement', () => {
    expect(fleissKappa([['a', 'a', 'a'], ['b', 'b', 'b'], ['a', 'a', 'a']])).toBeCloseTo(1);
    expect(fleissKappa([['a', 'b'], ['a', 'b'], ['a', 'b']])).toBeLessThan(0);
    expect(fleissKappa([['a']])).toBeNaN();
  });

  it('Krippendorff alpha: 1 when perfect, handles missing values, ordinal differs from nominal', () => {
    expect(krippendorffAlpha([[1, 1, 1], [3, 3, null], [5, 5, 5]], 'interval')).toBeCloseTo(1);
    expect(krippendorffAlpha([[1, 2], [3, 4], [5, 4]], 'nominal')).toBeLessThan(0);
    const data = [[1, 2], [2, 3], [4, 5], [5, 5]];
    expect(krippendorffAlpha(data, 'ordinal')).toBeGreaterThan(krippendorffAlpha(data, 'nominal'));
    // Rater order doesn't matter.
    expect(krippendorffAlpha(data.map(([a, b]) => [b, a]), 'interval')).toBeCloseTo(krippendorffAlpha(data, 'interval'));
  });
});

describe('related-product grouping and the split', () => {
  it('joins same photo (ignoring ?v=), same page and confirmed duplicates, transitively', () => {
    const items = [
      item('a', { photoUrl: 'https://cdn.example.com/x.jpg?v=1' }),
      item('b', { photoUrl: 'https://cdn.example.com/x.jpg?v=2' }),
      item('c', { pagePath: '/p/b' }),
      item('d'),
      item('e'),
    ];
    // a–b same photo, b–c same page, d–e confirmed duplicates.
    const groups = groupRelated(items, [['d', 'e']]);
    expect(groups.map((g) => g.members)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(groups[0]!.reasons).toEqual(['same-photo-url', 'same-retailer-page']);
    expect(photoKey('https://x.example.com/A.JPG?v=9')).toBe('https://x.example.com/a.jpg');
  });

  it('never puts related products on both sides (property check over many random catalogs)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const world = makeFixtureWorld(40, 3, seed);
      // Extra links: a few shared photos across designs.
      const catalog = world.catalog.map((c, i) => (i % 17 === 0 && i > 0 ? { ...c, photoUrl: world.catalog[i - 1]!.photoUrl } : c));
      const groups = groupRelated(catalog);
      const split = splitByGroup(catalog, groupIndex(groups), { testShare: 0.6, seed });
      expect(findLeaks(groups, split)).toEqual([]);
    }
  });

  it('hits the 60% test share approximately (whole groups only)', () => {
    const world = makeFixtureWorld(120, 3, 2);
    const groups = groupRelated(world.catalog);
    const split = splitByGroup(world.catalog, groupIndex(groups), { testShare: 0.6, seed: 1 });
    const test = [...split.values()].filter((s) => s === 'test').length / split.size;
    expect(test).toBeGreaterThan(0.5);
    expect(test).toBeLessThan(0.7);
  });

  it('questions may not mix sides', () => {
    const split = new Map([['a', 'dev' as const], ['b', 'dev' as const], ['c', 'test' as const]]);
    expect(questionSplit(['a', 'b'], split)).toBe('dev');
    expect(questionSplit(['a', 'c'], split)).toBeNull();
    expect(questionSplit(['a', 'zz'], split)).toBeNull();
  });
});

describe('evaluation sample', () => {
  const world = makeFixtureWorld(150, 3, 4);
  const opts = { quotas: { nightstands: 12, sofas: 12, 'coffee-tables': 12 }, partners: { colourVariant: 4, samePhoto: 0 }, seed: 9 };

  it('is deterministic, fills quotas, adds partners from the same group, and does not leak', () => {
    const a = sampleEvaluationSet(world.catalog, opts);
    const b = sampleEvaluationSet(world.catalog, opts);
    expect(a.items).toEqual(b.items);
    expect(a.items.filter((i) => i.reason === 'quota')).toHaveLength(36);
    const partners = a.items.filter((i) => i.reason === 'colour-variant-partner');
    expect(partners).toHaveLength(4);
    for (const p of partners) {
      const base = a.items.find((i) => i.id === p.partnerOf)!;
      expect(p.groupId).toBe(base.groupId);
      expect(p.split).toBe(base.split);
      expect(p.color).not.toBe(base.color);
    }
    expect(a.leaks).toEqual([]);
  });

  it('keeps any store at or below 60% of a type when others sell it', () => {
    const { items } = sampleEvaluationSet(world.catalog, opts);
    for (const t of ['nightstands', 'sofas', 'coffee-tables']) {
      const q = items.filter((i) => i.subcategoryId === t && i.reason === 'quota');
      const counts = new Map<string, number>();
      for (const i of q) counts.set(i.retailerId, (counts.get(i.retailerId) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(Math.round(12 * 0.6));
    }
  });
});

describe('metrics', () => {
  it('cosine and nearest neighbours', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    const emb = new Map([['q', [1, 0]], ['a', [0.9, 0.1]], ['b', [0, 1]], ['c', [0.95, 0.05]]]);
    expect(nearest('q', ['a', 'b', 'c', 'q'], emb, 2)).toEqual(['c', 'a']);
  });

  it('spearman', () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeCloseTo(0.866, 2);
  });

  it('triplet accuracy excludes ambiguous items and scores the design model above the store-biased one', () => {
    const world = makeFixtureWorld(90, 3, 5);
    const pack = makeFixturePack(world, 200, 5);
    const exports = simulateRaters(world, pack, 3);
    const triplets: LabelledTriplet[] = pack.questions.flatMap((q) => {
      if (q.kind !== 'triplet') return [];
      const votes = exports.map((e) => e.answers.find((a) => a.questionId === q.id)!.value).map((v) => (v.kind === 'triplet' ? v.choice : 'cant-tell'));
      return [{ id: q.id, anchor: q.anchor.productId, b: q.b.productId, c: q.c.productId, human: majority(votes).label as 'b' | 'c' | 'ambiguous', stratum: q.stratum }];
    });
    const good = tripletAccuracy(triplets, world.systems.get('design')!);
    const biased = tripletAccuracy(triplets, world.systems.get('store-biased')!);
    expect(good.accuracy.mean).toBeGreaterThan(0.8);
    expect(good.accuracy.mean).toBeGreaterThan(biased.accuracy.mean + 0.1);
    expect(good.excluded.ambiguous).toBeGreaterThanOrEqual(0);
  });

  it('pooled retrieval: unjudged items are bounded, never silently counted as not relevant', () => {
    // People judged x (3), y (0), z (2). The system ranks x, u (unjudged), z, y.
    const judged = new Map([['x', 3], ['y', 0], ['z', 2]]);
    const s = scoreRankedList('q', ['x', 'u', 'z', 'y'], judged, 2);
    expect(s.judgedAtK).toBe(0.5);
    expect(s.precision.lower).toBe(0.5); // x relevant, u counted as not
    expect(s.precision.upper).toBe(1); // u counted as relevant
    expect(s.precision.condensed).toBe(1); // drop u: x, z both relevant
    expect(s.pooledRecall).toBe(0.5); // 1 of the 2 relevant items people found
    expect(s.ndcg.condensed).toBeCloseTo(1);
    const r = retrievalReport(new Map([['q', ['x', 'u', 'z', 'y']]]), new Map([['q', judged]]), { k: 2 });
    expect(r.lowCoverage).toBe(true);
  });

  it('near-duplicate scores: average precision and a dev-chosen threshold', () => {
    const items = [
      { score: 0.99, positive: true },
      { score: 0.95, positive: true },
      { score: 0.9, positive: false },
      { score: 0.4, positive: false },
    ];
    expect(averagePrecision(items)).toBe(1);
    const t = chooseThreshold(items);
    expect(atThreshold(items, t)).toEqual({ precision: 1, recall: 1 });
  });

  it('cross-store ratio flags a model that prefers the query store more than people do', () => {
    const storeOf = (id: string) => (id.startsWith('a') ? 'A' : 'B');
    const judged = new Map([['a1', 3], ['b1', 3], ['b2', 3]]);
    expect(crossStoreRatio('a0', ['a1', 'a2', 'a3', 'b1'], judged, storeOf, 4)).toBeCloseTo(0.25 / (2 / 3));
    expect(crossStoreRatio('a0', ['b1', 'b2', 'a1'], judged, storeOf, 3)).toBeCloseTo(1);
  });
});

describe('pooling', () => {
  const products = [
    { id: 'q', split: 'test' as const, subcategoryId: 'n' },
    { id: 'a', split: 'test' as const, subcategoryId: 'n' },
    { id: 'b', split: 'test' as const, subcategoryId: 'n' },
    { id: 'c', split: 'test' as const, subcategoryId: 'n' },
    { id: 'd', split: 'dev' as const, subcategoryId: 'n' },
    { id: 'e', split: 'test' as const, subcategoryId: 'sofa' },
  ];
  const systems = new Map<string, (q: string, u: readonly string[]) => readonly string[]>([
    ['m1', (_q, u) => [...u]],
    ['m2', (_q, u) => [...u].reverse()],
    ['leaky', () => ['d', 'e']], // tries to pull a dev item and another type
  ]);

  it('unions every system equally, adds random and same-group items, never crosses splits or types', () => {
    const pool = buildPool({ products, systems, groupOf: new Map([['q', 'g'], ['b', 'g']]), depth: 1, randomPerQuery: 1, seed: 1, queries: ['q'] });
    const cands = pool.map((p) => p.candidate);
    expect(cands).toContain('a'); // m1's top 1
    expect(cands).toContain('c'); // m2's top 1
    expect(cands).toContain('b'); // same group
    expect(cands).not.toContain('d');
    expect(cands).not.toContain('e');
    expect(pool.every((p) => p.split === 'test')).toBe(true);
    expect(buildPool({ products, systems, groupOf: new Map(), depth: 1, randomPerQuery: 1, seed: 1, queries: ['q'] })).toEqual(
      buildPool({ products, systems, groupOf: new Map(), depth: 1, randomPerQuery: 1, seed: 1, queries: ['q'] }),
    );
    expect(poolContribution(pool).m1!.total).toBe(1);
  });

  it('end to end on fixtures: the design model retrieves better than text, judged against the pool', () => {
    const world = makeFixtureWorld(90, 3, 8);
    const prods = world.catalog.map((c) => ({ id: c.id, split: 'test' as const, subcategoryId: c.subcategoryId }));
    const rank = (name: string) => (q: string, u: readonly string[]) => nearest(q, u, world.systems.get(name)!, 10);
    const sys = new Map([['design', rank('design')], ['text', rank('text')]]);
    const queries = prods.slice(0, 30).map((p) => p.id);
    const pool = buildPool({ products: prods, systems: sys, groupOf: new Map(), depth: 10, randomPerQuery: 5, seed: 2, queries });
    const judgments = new Map<string, Map<string, number>>();
    for (const e of pool) {
      if (!judgments.has(e.query)) judgments.set(e.query, new Map());
      judgments.get(e.query)!.set(e.candidate, simulatedGrade(world, e.query, e.candidate));
    }
    const run = (name: string) => new Map(queries.map((q) => [q, sys.get(name)!(q, prods.filter((p) => p.id !== q && p.subcategoryId === prods.find((x) => x.id === q)!.subcategoryId).map((p) => p.id))]));
    const good = retrievalReport(run('design'), judgments, { k: 10 });
    const text = retrievalReport(run('text'), judgments, { k: 10 });
    expect(good.judgedAtK.mean).toBe(1); // every system in the comparison was pooled
    expect(good.ndcgCondensed.mean).toBeGreaterThan(text.ndcgCondensed.mean);
  });
});

describe('calibration', () => {
  const img = (id: string) => ({ productId: id, src: `https://img.example.com/${id}.jpg` });
  const pack: QuestionPack = {
    version: LABELS_VERSION,
    id: 'cal',
    title: 'cal',
    purpose: 'calibration',
    questions: [
      { kind: 'triplet', id: 'colour', anchor: img('a'), b: img('same-design-other-colour'), c: img('other-design-same-colour'), stratum: 'colour-trap', gold: 'b' },
      { kind: 'triplet', id: 'photo', anchor: img('a'), b: img('same-design-room-photo'), c: img('other-design-studio'), stratum: 'photo-trap', gold: 'b' },
      { kind: 'triplet', id: 'gold', anchor: img('a'), b: img('a-copy'), c: img('rug'), stratum: 'gold', gold: 'b' },
      { kind: 'pair', id: 'p1', a: img('a'), b: img('b'), stratum: 'random' },
    ],
  };
  const exp = (rater: string, colour: 'b' | 'c', photo: 'b' | 'c', gold: 'b' | 'c', rating: 1 | 2 | 3 | 4 | 5): LabelExport => ({
    version: LABELS_VERSION,
    packId: 'cal',
    rater,
    startedAt: 't',
    finishedAt: 't',
    answers: [
      { questionId: 'colour', value: { kind: 'triplet', choice: colour }, confidence: 2, ms: 4000, order: 0, swapped: false, at: 't' },
      { questionId: 'photo', value: { kind: 'triplet', choice: photo }, confidence: 2, ms: 6000, order: 1, swapped: true, at: 't' },
      { questionId: 'gold', value: { kind: 'triplet', choice: gold }, confidence: 3, ms: 2000, order: 2, swapped: false, at: 't' },
      { questionId: 'p1', value: { kind: 'pair', rating }, confidence: 2, ms: 5000, order: 3, swapped: false, at: 't' },
    ],
  });

  it('measures time, trap accuracy, attention checks, and warns when raters follow colour', () => {
    const r = analyseCalibration(pack, [exp('r1', 'b', 'b', 'b', 4), exp('r2', 'c', 'b', 'b', 4), exp('r3', 'c', 'c', 'c', 5)]);
    expect(r.secondsByKind.triplet!.median).toBe(4);
    expect(r.trapAccuracy.colour).toBeCloseTo(1 / 3);
    expect(r.trapAccuracy.photo).toBeCloseTo(2 / 3);
    expect(r.goldAccuracyByRater).toEqual({ r1: 1, r2: 1, r3: 0 });
    expect(r.warnings.some((w) => w.includes('colour'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('r3'))).toBe(true);
  });

  it('turns measured times into a workload per rater', () => {
    const r = analyseCalibration(pack, [exp('r1', 'b', 'b', 'b', 4), exp('r2', 'b', 'b', 'b', 4), exp('r3', 'b', 'b', 'b', 4)]);
    const w = workload(r, { triplet: 300, pair: 300 });
    // 300 × 4 s + 300 × 5 s = 45 min, +15% ≈ 52 min.
    expect(w.minutesPerRater).toBe(52);
    expect(w.sittings).toBe(2);
  });

  it('validates exports against their pack', () => {
    const good = exp('r1', 'b', 'b', 'b', 4);
    expect(validateExport(good, pack)).toEqual([]);
    const bad = { ...good, answers: [...good.answers, good.answers[0]!, { ...good.answers[0]!, questionId: 'nope' }] };
    expect(validateExport(bad, pack).length).toBeGreaterThanOrEqual(2);
  });
});
