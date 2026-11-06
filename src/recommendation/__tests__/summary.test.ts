import type { Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import { computePriceBands } from '../engine';
import { affinity, buildTasteModel, EMPTY_MODEL } from '../model';
import { hashSeed } from '../random';
import { rankDeck, rerankDeck } from '../rank';
import { makeShopper, utility } from '../sim/simulate';
import type { Feedback } from '../signals';
import { priceBandFor, tasteSummary } from '../summary';

const catalog = generateCatalog();
const products = new Map(catalog.map((p) => [p.id, p]));
const bands = computePriceBands(catalog);
const swipe = (p: Product, direction: 'keep' | 'skip', at: number): SwipeEvent => ({
  id: `${p.id}@${at}`,
  productId: p.id,
  categoryId: p.categoryId,
  direction,
  swipedAt: at,
});

/** A shopper who keeps walnut and skips velvet, over 40 swipes. */
function walnutShopper(feedback: Feedback[] = []) {
  const walnut = catalog.filter((p) => p.material === 'walnut').slice(0, 14);
  const velvet = catalog.filter((p) => p.material === 'velvet').slice(0, 14);
  const other = catalog.filter((p) => p.material !== 'walnut' && p.material !== 'velvet').slice(0, 12);
  const swipes = [
    ...walnut.map((p, i) => swipe(p, 'keep', i * 3)),
    ...velvet.map((p, i) => swipe(p, 'skip', i * 3 + 1)),
    ...other.map((p, i) => swipe(p, i % 3 === 0 ? 'keep' : 'skip', i * 3 + 2)),
  ];
  return { swipes, model: buildTasteModel({ swipes, products, bands, feedback }) };
}

describe('tasteSummary', () => {
  it('says nothing confident for a new shopper', () => {
    const s = tasteSummary(EMPTY_MODEL);
    expect(s.stage).toBe('learning');
    expect(s.headline).toBeNull();
    expect([...s.styles, ...s.materials, ...s.colors, ...s.dislikes]).toEqual([]);
  });

  it('names what they keep and what they skip', () => {
    const s = tasteSummary(walnutShopper().model);
    expect(s.stage).toBe('confident');
    expect(s.materials[0]?.label).toBe('walnut');
    expect(s.dislikes.map((t) => t.label)).toContain('velvet');
    expect(s.materials.map((t) => t.label)).not.toContain('velvet');
    expect(s.headline).toMatch(/walnut/i);
  });

  it('respects the per-kind limits', () => {
    const s = tasteSummary(walnutShopper().model);
    expect(s.styles.length).toBeLessThanOrEqual(4);
    expect(s.materials.length).toBeLessThanOrEqual(5);
    expect(s.colors.length).toBeLessThanOrEqual(5);
    expect(s.dislikes.length).toBeLessThanOrEqual(6);
  });

  it('shows first-launch style picks right away', () => {
    const model = buildTasteModel({ swipes: [], products, bands, seedStyles: ['coastal', 'minimal', 'modern'] });
    const s = tasteSummary(model);
    expect(s.stage).toBe('shaping');
    expect(s.styles.map((t) => t.label).sort()).toEqual(['coastal', 'minimal', 'modern']);
  });
});

describe('accuracy on simulated shoppers with known tastes', () => {
  it('names likes and dislikes that are almost always right', () => {
    let right = 0;
    let named = 0;
    for (let id = 1; id <= 16; id++) {
      const shopper = makeShopper(id, catalog, true);
      const swipes: SwipeEvent[] = [];
      const model = () => buildTasteModel({ swipes, products, bands, seedStyles: shopper.picks });
      let deck = rankDeck(catalog, model(), { bands, seed: hashSeed(`d${id}`) });
      for (let i = 0; i < 30; i++) {
        const p = deck[0].product;
        swipes.push(swipe(p, utility(shopper, p, bands) > 0 ? 'keep' : 'skip', i));
        deck = rerankDeck(deck.slice(1), model(), { bands, seed: hashSeed(`d${id}:${i}`), position: i + 1 });
      }
      const s = tasteSummary(model());
      for (const t of [...s.styles, ...s.materials, ...s.colors]) {
        named++;
        if ((shopper.weights[t.key] ?? 0) > 0) right++;
      }
      for (const t of s.dislikes) {
        named++;
        if ((shopper.weights[t.key] ?? 0) < 0) right++;
      }
    }
    expect(named).toBeGreaterThanOrEqual(16);
    expect(right / named).toBeGreaterThanOrEqual(0.85);
  });
});

describe('adjusting taste', () => {
  it('"more" lifts a feature and marks it', () => {
    const before = walnutShopper().model;
    const after = walnutShopper([
      { id: 'f', at: 999, kind: 'feature', featureKey: 'material:linen', answer: 'more' },
    ]).model;
    expect(affinity(after, 'material:linen').mean).toBeGreaterThan(affinity(before, 'material:linen').mean);
    const linen = tasteSummary(after).materials.find((t) => t.key === 'material:linen');
    expect(linen?.adjusted).toBe('more');
  });

  it('"less" moves a feature to Less your thing', () => {
    const { model } = walnutShopper([
      { id: 'f', at: 999, kind: 'feature', featureKey: 'material:walnut', answer: 'less' },
    ]);
    const s = tasteSummary(model);
    expect(s.materials.map((t) => t.key)).not.toContain('material:walnut');
    expect(s.dislikes.find((t) => t.key === 'material:walnut')?.adjusted).toBe('less');
  });

  it('"forget" drops what was learned before it', () => {
    const { model } = walnutShopper([
      { id: 'f', at: 999, kind: 'feature', featureKey: 'material:velvet', answer: 'forget' },
    ]);
    expect(Math.abs(affinity(model, 'material:velvet').mean)).toBeLessThan(0.15);
    expect(tasteSummary(model).dislikes.map((t) => t.key)).not.toContain('material:velvet');
  });

  it('"forget" also clears an earlier answer and a style pick', () => {
    const model = buildTasteModel({
      swipes: [],
      products,
      bands,
      seedStyles: ['coastal'],
      feedback: [
        { id: 'a', at: 1, kind: 'feature', featureKey: 'material:oak', answer: 'less' },
        { id: 'b', at: 2, kind: 'feature', featureKey: 'material:oak', answer: 'forget' },
        { id: 'c', at: 3, kind: 'feature', featureKey: 'style:coastal', answer: 'forget' },
      ],
    });
    expect(model.muted).not.toContain('material:oak');
    expect(tasteSummary(model).styles.map((t) => t.key)).not.toContain('style:coastal');
  });

  it('"start fresh" forgets everything before it, but later swipes count', () => {
    const { swipes } = walnutShopper();
    const later = catalog
      .filter((p) => p.material === 'oak')
      .slice(0, 3)
      .map((p, i) => swipe(p, 'keep', 1000 + i));
    const model = buildTasteModel({
      swipes: [...swipes, ...later],
      products,
      bands,
      seedStyles: ['coastal'],
      feedback: [{ id: 'r', at: 500, kind: 'reset' }],
    });
    expect(model.swipeCount).toBe(3);
    expect(model.keepCount).toBe(3);
    expect(tasteSummary(model).dislikes.map((t) => t.key)).not.toContain('material:velvet');
    expect(model.seeded).toBe(false);
  });
});

describe('priceBandFor', () => {
  it('is null without a budget, and in dollars of the asked type with one', () => {
    expect(priceBandFor(EMPTY_MODEL, bands, 'sofas')).toBeNull();
    const model = buildTasteModel({
      swipes: [],
      products,
      bands,
      statedBudget: { subcategoryId: 'sofas', maxCents: 150000 },
    });
    const band = priceBandFor(model, bands, 'sofas')!;
    expect(band.usualCents).toBeLessThan(band.ceilingCents);
    expect(band.ceilingCents).toBeGreaterThan(120000);
    expect(band.ceilingCents).toBeLessThan(180000);
    expect(band.usualCents % 5000).toBe(0);
  });
});
