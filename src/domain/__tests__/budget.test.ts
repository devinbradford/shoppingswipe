import { generateCatalog } from '../../data/sample/catalog';
import { computePriceBands } from '../../recommendation/engine';
import { buildTasteModel, priceRatio } from '../../recommendation/model';
import { rankDeck } from '../../recommendation/rank';
import {
  budgetAnchor,
  budgetAnswer,
  budgetFromDollars,
  budgetIndex,
  formatBudget,
  nearestIndex,
  NO_LIMIT,
  parseDollars,
} from '../budget';

describe('budget question', () => {
  it('asks about the key piece for each room, sofas when just browsing', () => {
    expect(budgetAnchor('living-room').noun).toBe('a sofa');
    expect(budgetAnchor('bedroom').subcategoryId).toBe('bed-frames');
    expect(budgetAnchor('kitchen-dining').subcategoryId).toBe('dining-tables');
    expect(budgetAnchor('browsing').subcategoryId).toBe('sofas');
    expect(budgetAnchor(null).subcategoryId).toBe('sofas');
  });

  it('every slider ends with "no limit" and starts on a real price', () => {
    for (const room of ['living-room', 'bedroom', 'kitchen-dining', 'browsing'] as const) {
      const a = budgetAnchor(room);
      expect(a.stops.at(-1)).toBe(NO_LIMIT);
      expect(a.stops[a.defaultIndex]).toBeGreaterThan(0);
      const real = a.stops.slice(0, -1);
      expect([...real].sort((x, y) => x - y)).toEqual(real);
    }
  });

  it('formats and saves answers; "no limit" saves nothing', () => {
    expect(formatBudget(1500)).toBe('Up to $1,500');
    expect(formatBudget(NO_LIMIT)).toBe('No limit');
    const sofa = budgetAnchor('living-room');
    expect(budgetAnswer(sofa, sofa.defaultIndex)).toEqual({ subcategoryId: 'sofas', maxCents: 150000 });
    expect(budgetAnswer(sofa, sofa.stops.length - 1)).toBeNull();
  });
});

describe('stated budget in the taste model', () => {
  const catalog = generateCatalog({ perSubcategory: 60, seed: 5 });
  const bands = computePriceBands(catalog);
  const products = new Map(catalog.map((p) => [p.id, p]));

  it('sets a price ceiling before any swipes', () => {
    const model = buildTasteModel({
      swipes: [],
      products,
      bands,
      statedBudget: { subcategoryId: 'sofas', maxCents: 100000 },
    });
    expect(model.budget).not.toBeNull();
    const cap = priceRatio({ priceCents: 100000, subcategoryId: 'sofas' }, bands);
    expect(model.budget!.ceiling).toBeCloseTo(cap + 0.05, 5);
  });

  it('pushes over-budget pieces down from the first card, in every room', () => {
    const seeded = { swipes: [], products, bands, seedStyles: ['minimal', 'modern', 'coastal'] };
    const withBudget = buildTasteModel({ ...seeded, statedBudget: { subcategoryId: 'sofas', maxCents: 100000 } });
    const without = buildTasteModel(seeded);
    for (const type of ['sofas', 'nightstands'] as const) {
      const deck = catalog.filter((p) => p.subcategoryId === type);
      const cap = withBudget.budget!.ceiling;
      const over = (ids: string[]) =>
        ids.filter((id) => priceRatio(products.get(id)!, bands) > cap + 0.25).length / ids.length;
      const top = (m: typeof without) =>
        rankDeck(deck, m, { bands, seed: 3 })
          .slice(0, 15)
          .map((r) => r.product.id);
      expect(over(top(withBudget))).toBeLessThan(over(top(without)));
    }
  });

  it('lets real behavior take over from the stated budget', () => {
    const pricey = catalog
      .filter((p) => p.subcategoryId === 'sofas')
      .sort((a, b) => b.priceCents - a.priceCents)
      .slice(0, 8);
    const swipes = pricey.map((p, i) => ({
      id: `k${i}`,
      productId: p.id,
      categoryId: p.categoryId,
      direction: 'keep' as const,
      swipedAt: i,
    }));
    const stated = { subcategoryId: 'sofas' as const, maxCents: 60000 };
    const early = buildTasteModel({ swipes: [], products, bands, statedBudget: stated });
    const later = buildTasteModel({ swipes, products, bands, statedBudget: stated });
    expect(later.budget!.ceiling).toBeGreaterThan(early.budget!.ceiling);
  });
});

describe('budgetIndex', () => {
  const sofa = budgetAnchor('living-room');
  it('finds the saved stop again, so editing starts where they left it', () => {
    for (let i = 0; i < sofa.stops.length; i++) expect(budgetIndex(sofa, budgetAnswer(sofa, i))).toBe(i);
  });
  it('starts on the default when the saved answer is for another piece', () => {
    expect(budgetIndex(budgetAnchor('bedroom'), budgetAnswer(sofa, 0))).toBe(budgetAnchor('bedroom').defaultIndex);
  });
});

describe('typed budgets', () => {
  const sofa = budgetAnchor('living-room');
  it('reads what people type', () => {
    expect(parseDollars('$2,000')).toBe(2000);
    expect(parseDollars(' 1800 ')).toBe(1800);
    expect(parseDollars('2k')).toBe(2000);
    expect(parseDollars('1.5k')).toBe(1500);
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('5')).toBeNull();
  });
  it('saves any amount and finds the nearest slider stop', () => {
    expect(budgetFromDollars(sofa, 1850)).toEqual({ subcategoryId: 'sofas', maxCents: 185000 });
    expect(budgetFromDollars(sofa, 0)).toBeNull();
    expect(sofa.stops[nearestIndex(sofa, 1850)]).toBe(1750);
    expect(sofa.stops[nearestIndex(sofa, 99999)]).toBe(4000);
  });
  it('has $2,000 as a sofa stop', () => {
    expect(sofa.stops).toContain(2000);
  });
});
