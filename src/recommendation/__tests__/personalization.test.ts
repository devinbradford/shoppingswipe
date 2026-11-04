import type { Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import { computePriceBands } from '../engine';
import { affinity, buildTasteModel, EMPTY_MODEL, isColdStartModel, priceRatio } from '../model';
import { rankDeck, rerankDeck, scoreCandidates } from '../rank';
import { EMPTY_QUESTION_STATE, markAsked, nextQuestion, type SessionSwipe } from '../questions';
import type { EngagementSignal, Feedback } from '../signals';
import { benchmark } from '../sim/simulate';

let n = 0;
function product(overrides: Partial<Product> = {}): Product {
  n++;
  return {
    id: `v${String(n).padStart(4, '0')}`,
    categoryId: 'living-room',
    subcategoryId: 'sofas',
    retailerId: 'r1',
    title: 'Thing',
    brand: 'Brand',
    description: '',
    priceCents: 100000,
    currency: 'USD',
    imageUrls: [],
    productUrl: 'https://shop.example.com/x',
    styleTags: ['minimal'],
    material: 'oak',
    color: 'white',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
const byId = (ps: Product[]) => new Map(ps.map((p) => [p.id, p]));
const swipe = (p: Product, direction: 'keep' | 'skip', at: number): SwipeEvent => ({
  id: `${p.id}@${at}`,
  productId: p.id,
  categoryId: p.categoryId,
  direction,
  swipedAt: at,
});
const noExplore = {
  featureWeights: { style: 1, brand: 0.7, material: 0.6, price: 0.6, color: 0.5, retailer: 0.25 },
  reasonThreshold: 0.25,
  thompsonScale: 0,
  probeEvery: 0,
  diversityPenalty: 0,
  budgetPenalty: 1.6,
  hardNegativeMean: -0.6,
  hardNegativeN: 2.5,
  hardNegativePenalty: 0.6,
};

describe('taste model v2', () => {
  it('gives credit to the feature that explains the keeps, not everything on a kept product', () => {
    // Every keep is boucle; colors vary on keeps and skips alike.
    const ps: Product[] = [];
    const swipes: SwipeEvent[] = [];
    const colors = ['cream', 'navy', 'rust', 'sage'];
    for (let i = 0; i < 16; i++) {
      const keep = i % 2 === 0;
      // Each keep/skip pair shares a color, so color says nothing about keeping.
      const p = product({ material: keep ? 'boucle' : 'leather', color: colors[Math.floor(i / 2) % 4] });
      ps.push(p);
      swipes.push(swipe(p, keep ? 'keep' : 'skip', i));
    }
    const model = buildTasteModel({ swipes, products: byId(ps), bands: {} });
    // Credit splits between the two materials that perfectly predict keeps; colors stay near zero.
    expect(affinity(model, 'material:boucle').mean).toBeGreaterThan(0.7);
    expect(affinity(model, 'material:leather').mean).toBeLessThan(-0.7);
    expect(Math.abs(affinity(model, 'color:sage').mean)).toBeLessThan(affinity(model, 'material:boucle').mean / 2);
  });

  it('is less sure about features it has barely seen', () => {
    const ps = Array.from({ length: 6 }, (_, i) => product({ material: i < 5 ? 'walnut' : 'rattan' }));
    const model = buildTasteModel({ swipes: ps.map((p, i) => swipe(p, 'keep', i)), products: byId(ps), bands: {} });
    expect(affinity(model, 'material:rattan').sd).toBeGreaterThan(affinity(model, 'material:walnut').sd);
    expect(affinity(model, 'material:never-seen').sd).toBe(model.priorSd);
  });

  it('counts Buy now and list adds more than a keep, and un-keeping against', () => {
    const a = product({ material: 'velvet' });
    const b = product({ material: 'linen' });
    const filler = Array.from({ length: 6 }, () => product({ material: 'steel' }));
    const swipes = [swipe(a, 'keep', 1), swipe(b, 'keep', 1), ...filler.map((p, i) => swipe(p, 'skip', 2 + i))];
    const signals: EngagementSignal[] = [{ id: 's', productId: a.id, type: 'buy_click', at: 1 }];
    const model = buildTasteModel({ swipes, products: byId([a, b, ...filler]), bands: {}, signals });
    expect(affinity(model, 'material:velvet').mean).toBeGreaterThan(affinity(model, 'material:linen').mean);

    const regret = buildTasteModel({
      swipes,
      products: byId([a, b, ...filler]),
      bands: {},
      signals: [{ id: 'u', productId: b.id, type: 'unsave', at: 20 }],
    });
    expect(affinity(regret, 'material:linen').mean).toBeLessThan(affinity(model, 'material:linen').mean);
  });

  it('treats fast skips as firmer than slow ones', () => {
    const fast = product({ color: 'rust' });
    const slow = product({ color: 'sage' });
    const keeps = Array.from({ length: 4 }, () => product({ color: 'cream' }));
    const swipes = [...keeps.map((p, i) => swipe(p, 'keep', i)), swipe(fast, 'skip', 10), swipe(slow, 'skip', 10)];
    const signals: EngagementSignal[] = [
      { id: 'a', productId: fast.id, type: 'swipe_dwell', at: 10, value: 300 },
      { id: 'b', productId: slow.id, type: 'swipe_dwell', at: 10, value: 6000 },
    ];
    const model = buildTasteModel({ swipes, products: byId([fast, slow, ...keeps]), bands: {}, signals });
    expect(affinity(model, 'color:rust').mean).toBeLessThan(affinity(model, 'color:sage').mean);
  });

  it('applies answers: "less" mutes, "fine" stops skips counting, a skip reason blames one aspect', () => {
    const boucle = Array.from({ length: 4 }, () => product({ material: 'boucle', color: 'navy' }));
    const keeps = Array.from({ length: 4 }, () => product({ material: 'oak', color: 'cream' }));
    const swipes = [...keeps.map((p, i) => swipe(p, 'keep', i)), ...boucle.map((p, i) => swipe(p, 'skip', 10 + i))];
    const products = byId([...boucle, ...keeps]);
    const base = buildTasteModel({ swipes, products, bands: {} });

    const fine: Feedback[] = [{ id: 'f', at: 99, kind: 'feature', featureKey: 'material:boucle', answer: 'fine' }];
    expect(affinity(buildTasteModel({ swipes, products, bands: {}, feedback: fine }), 'material:boucle').mean).toBeGreaterThan(
      affinity(base, 'material:boucle').mean,
    );

    const less: Feedback[] = [{ id: 'l', at: 99, kind: 'feature', featureKey: 'color:sage', answer: 'less' }];
    const muted = buildTasteModel({ swipes, products, bands: {}, feedback: less });
    expect(affinity(muted, 'color:sage').mean).toBeLessThan(-1.5);

    const why: Feedback[] = boucle.map((p, i) => ({ id: `w${i}`, at: 99, kind: 'skip_reason', productId: p.id, reason: 'color' }));
    const blamed = buildTasteModel({ swipes, products, bands: {}, feedback: why });
    expect(affinity(blamed, 'material:boucle').mean).toBeGreaterThan(affinity(base, 'material:boucle').mean);
    expect(affinity(blamed, 'color:navy').mean).toBeLessThan(0);
  });

  it('learns a price ceiling relative to each product type', () => {
    const cheapSofas = [80000, 90000, 100000, 85000].map((c) => product({ priceCents: c }));
    const bands = computePriceBands([30000, 60000, 90000, 150000, 250000, 350000].map((c) => product({ priceCents: c })));
    const model = buildTasteModel({ swipes: cheapSofas.map((p, i) => swipe(p, 'keep', i)), products: byId(cheapSofas), bands });
    expect(model.budget).not.toBeNull();
    expect(model.budget!.ceiling).toBeLessThan(priceRatio(product({ priceCents: 300000 }), bands));
    expect(model.budget!.ceiling).toBeGreaterThan(priceRatio(product({ priceCents: 100000 }), bands));
  });

  it('starts personal ranking after 3 positives or 3 style picks', () => {
    expect(isColdStartModel(EMPTY_MODEL)).toBe(true);
    expect(isColdStartModel(buildTasteModel({ swipes: [], products: new Map(), bands: {}, seedStyles: ['a', 'b', 'c'] }))).toBe(false);
  });
});

describe('ranking v2', () => {
  const kept = Array.from({ length: 4 }, () => product({ styleTags: ['mid-century'], material: 'walnut' }));
  const skipped = Array.from({ length: 4 }, () => product({ styleTags: ['industrial'], material: 'steel' }));
  const model = buildTasteModel({
    swipes: [...kept.map((p, i) => swipe(p, 'keep', i)), ...skipped.map((p, i) => swipe(p, 'skip', 10 + i))],
    products: byId([...kept, ...skipped]),
    bands: {},
  });

  it('ranks matches first, with a reason, and confident dislikes last', () => {
    const match = product({ styleTags: ['mid-century'], material: 'walnut' });
    const neutral = product({ styleTags: ['coastal'], material: 'rattan' });
    const disliked = product({ styleTags: ['industrial'], material: 'steel' });
    const ranked = rankDeck([disliked, neutral, match], model, { bands: {}, seed: 1, options: noExplore });
    expect(ranked.map((r) => r.product.id)).toEqual([match.id, neutral.id, disliked.id]);
    expect(ranked[0].reasons.map((r) => r.label)).toEqual(expect.arrayContaining(['mid-century']));
  });

  it('pushes pieces far over the learned budget down', () => {
    const bands = computePriceBands([30000, 60000, 90000, 150000, 250000, 350000].map((c) => product({ priceCents: c })));
    const cheap = [80000, 90000, 100000, 85000].map((c) => product({ priceCents: c, material: 'walnut' }));
    const m = buildTasteModel({ swipes: cheap.map((p, i) => swipe(p, 'keep', i)), products: byId(cheap), bands });
    const [inBudget, pricey] = [product({ priceCents: 95000, material: 'walnut' }), product({ priceCents: 340000, material: 'walnut' })];
    const ranked = rankDeck([pricey, inBudget], m, { bands, seed: 1, options: noExplore });
    expect(ranked[0].product.id).toBe(inBudget.id);
  });

  it('spreads look-alikes apart', () => {
    const twins = Array.from({ length: 4 }, () => product({ styleTags: ['mid-century'], material: 'walnut', color: 'walnut' }));
    const others = Array.from({ length: 4 }, (_, i) =>
      product({ styleTags: ['mid-century'], material: ['oak', 'linen', 'boucle', 'velvet'][i], color: 'cream' }),
    );
    const ranked = rankDeck([...twins, ...others], model, { bands: {}, seed: 2, options: { ...noExplore, diversityPenalty: 2 } });
    for (let i = 1; i < 6; i++) {
      const a = ranked[i - 1].product;
      const b = ranked[i].product;
      expect(a.material === 'walnut' && b.material === 'walnut' && a.color === b.color).toBe(false);
    }
  });

  it('places a probe card every 7th slot, never a confident dislike, steady across re-ranks', () => {
    const catalog = generateCatalog({ perSubcategory: 40, seed: 3 }).filter((p) => p.categoryId === 'living-room');
    const ranked = rankDeck(catalog, model, { bands: computePriceBands(catalog), seed: 4 });
    const probes = ranked.slice(0, 40).map((r, i) => (r.explored ? i : -1)).filter((i) => i >= 0);
    expect(probes).toEqual([6, 13, 20, 27, 34]);
    const scored = scoreCandidates(catalog, model, { bands: computePriceBands(catalog), seed: 4 });
    const avoid = new Set(scored.filter((s) => s.avoid).map((s) => s.product.id));
    expect(probes.every((i) => !avoid.has(ranked[i].product.id))).toBe(true);

    const next = rerankDeck(ranked, model, { bands: computePriceBands(catalog), seed: 5, position: 1 });
    expect(next.slice(0, 2).map((r) => r.product.id)).toEqual(ranked.slice(0, 2).map((r) => r.product.id));
    // Deck position 1 + 2 pinned cards: the next probe lands at index 5 (overall card #7).
    expect(next.slice(2, 12).map((r, i) => (r.explored ? i + 2 : -1)).filter((i) => i >= 0)).toEqual([5]);
  });

  it('opens with cards covering many styles, materials and colors', () => {
    const catalog = generateCatalog({ perSubcategory: 40, seed: 3 }).filter((p) => p.categoryId === 'living-room');
    const first = rankDeck(catalog, EMPTY_MODEL, { bands: {}, seed: 1 }).slice(0, 8);
    expect(new Set(first.flatMap((r) => r.product.styleTags)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(first.map((r) => r.product.material)).size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic per seed and fast on a 12k catalog', () => {
    const catalog = generateCatalog({ perSubcategory: 1100 });
    const bands = computePriceBands(catalog);
    const m = buildTasteModel({
      swipes: catalog.filter((_, i) => i % 97 === 0).slice(0, 60).map((p, i) => swipe(p, i % 3 ? 'keep' : 'skip', i)),
      products: byId(catalog),
      bands,
    });
    const start = Date.now();
    const a = rankDeck(catalog, m, { bands, seed: 9 });
    expect(Date.now() - start).toBeLessThan(3000);
    const b = rankDeck(catalog, m, { bands, seed: 9 });
    expect(a.map((r) => r.product.id)).toEqual(b.map((r) => r.product.id));
    expect(a).toHaveLength(catalog.length);
  });
});

describe('questions', () => {
  const s = (p: Product, direction: 'keep' | 'skip', extra: Partial<SessionSwipe> = {}): SessionSwipe => ({
    product: p,
    direction,
    dwellMs: 2000,
    predicted: 0,
    forYou: false,
    ...extra,
  });
  const empty = buildTasteModel({ swipes: [], products: new Map(), bands: {} });

  it('asks about a pattern of skips sharing what was just skipped', () => {
    const session = [
      s(product({ material: 'boucle' }), 'skip'),
      s(product({ material: 'oak' }), 'keep'),
      s(product({ material: 'boucle' }), 'skip'),
      s(product({ material: 'boucle', color: 'navy' }), 'skip'),
    ];
    const q = nextQuestion(session, empty, {}, EMPTY_QUESTION_STATE);
    expect(q).toMatchObject({ type: 'feature', trigger: 'pattern', featureKey: 'material:boucle', title: 'Not into boucle?' });
  });

  it('never asks after a keep, twice about the same thing, within 8 swipes, on a fast streak, or after 2 ignores', () => {
    const skips = Array.from({ length: 3 }, () => s(product({ material: 'boucle' }), 'skip'));
    expect(nextQuestion([...skips, s(product(), 'keep')], empty, {}, EMPTY_QUESTION_STATE)).toBeNull();

    const q = nextQuestion(skips, empty, {}, EMPTY_QUESTION_STATE)!;
    const asked = markAsked(EMPTY_QUESTION_STATE, q, 3);
    expect(nextQuestion(skips, empty, {}, asked)).toBeNull();
    const later = Array.from({ length: 9 }, () => s(product({ material: 'boucle' }), 'skip'));
    expect(nextQuestion(later, empty, {}, { ...asked, lastAskedAt: 3 })).toBeNull(); // same key already asked

    const cooled = { asked: [], lastAskedAt: 1, ignoredStreak: 0 };
    expect(nextQuestion(skips, empty, {}, cooled)).toBeNull();

    const fast = skips.map((x) => ({ ...x, dwellMs: 300 }));
    expect(nextQuestion(fast, empty, {}, EMPTY_QUESTION_STATE)).toBeNull();

    expect(nextQuestion(skips, empty, {}, { asked: [], lastAskedAt: null, ignoredStreak: 2 })).toBeNull();
  });

  it('asks "gone off walnut?" when an old favourite keeps getting skipped', () => {
    const keeps = Array.from({ length: 3 }, () => product({ material: 'walnut' }));
    const model = buildTasteModel({ swipes: keeps.map((p, i) => swipe(p, 'keep', i)), products: byId(keeps), bands: {} });
    const session = [
      s(product({ material: 'walnut', color: 'black' }), 'skip'),
      s(product({ material: 'linen', color: 'cream' }), 'keep'),
      s(product({ material: 'walnut', color: 'rust' }), 'skip'),
    ];
    expect(nextQuestion(session, model, {}, EMPTY_QUESTION_STATE)).toMatchObject({ trigger: 'mixed', title: 'Gone off walnut?' });
  });

  it('asks "what put you off?" after skipping a strong For you pick', () => {
    const q = nextQuestion([s(product(), 'skip', { forYou: true, predicted: 1.2 })], empty, {}, EMPTY_QUESTION_STATE);
    expect(q).toMatchObject({ type: 'why', title: 'What put you off?' });
  });
});

describe('simulated shoppers', () => {
  it('v2 finds taste faster and shows better, more affordable picks than v1', () => {
    const catalog = generateCatalog({ perSubcategory: 60, seed: 11 }).filter((p) => p.categoryId === 'living-room');
    const [v1, v2] = benchmark(catalog, { shoppers: 20, withPicks: true, swipes: 40 }, ['v1', 'v2']);
    expect(v2.keepRateSwipes11to30).toBeGreaterThan(v1.keepRateSwipes11to30);
    expect(v2.avgUtilityLate).toBeGreaterThan(v1.avgUtilityLate);
    expect(v2.overBudgetLate).toBeLessThan(v1.overBudgetLate);
    expect(v2.questionsPer50).toBeLessThanOrEqual(5);
  }, 120000);
});
