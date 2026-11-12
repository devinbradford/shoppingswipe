import { EMPTY_FILTERS } from '@/domain/filters';
import type { SwipeEvent } from '@/domain/types';
import { CATEGORIES, generateCatalog, RETAILERS, SUBCATEGORIES } from '@/data/sample/catalog';
import { LocalProductRepository } from '@/data/LocalProductRepository';
import { buildTasteModel, computePriceBands, rankDeck } from '@/recommendation';
import {
  CANDIDATE_POOL_SIZE,
  chunk,
  deckStatusFor,
  isEligible,
  REFILL_AT,
  sampleIds,
  shouldRefill,
} from '../candidatePool';

const many = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(6, '0')}`);

describe('sampleIds', () => {
  it('returns everything (in id order) when it fits', () => {
    expect(sampleIds(['c', 'a', 'b'], 5, 1)).toEqual(['a', 'b', 'c']);
    expect(sampleIds(many(1000), 1000, 1)).toHaveLength(1000);
  });

  it('picks evenly across the list, not the first ones', () => {
    const picked = sampleIds(many(10_000), 1000, 7);
    expect(picked).toHaveLength(1000);
    const perThousand = Array.from({ length: 10 }, (_, k) => picked.filter((id) => Number(id.slice(1)) / 1000 >= k && Number(id.slice(1)) / 1000 < k + 1).length);
    for (const n of perThousand) expect(n).toBeGreaterThan(70); // ~100 expected in each tenth (was 36–191 before mixing)
  });

  it('is deterministic, duplicate-free and seed-dependent', () => {
    const ids = [...many(3000), 'p000001', 'p000002'];
    const a = sampleIds(ids, 500, 1);
    expect(sampleIds(ids, 500, 1)).toEqual(a);
    expect(new Set(a).size).toBe(500);
    expect(sampleIds(ids, 500, 2)).not.toEqual(a);
  });
});

describe('isEligible', () => {
  const e = { id: 'x', categoryId: 'bedroom', subcategoryId: 'nightstands', retailerId: 'r1', priceCents: 15000 };
  it('applies room, type, swiped, store and price rules', () => {
    expect(isEligible(e, {})).toBe(true);
    expect(isEligible(e, { categoryId: 'living-room' })).toBe(false);
    expect(isEligible(e, { subcategoryId: 'dressers' })).toBe(false);
    expect(isEligible(e, { excludeIds: new Set(['x']) })).toBe(false);
    expect(isEligible(e, { filters: { ...EMPTY_FILTERS, retailerIds: ['r2'] } })).toBe(false);
    expect(isEligible(e, { filters: { ...EMPTY_FILTERS, minPriceCents: 20000 } })).toBe(false);
    expect(isEligible(e, { filters: { ...EMPTY_FILTERS, maxPriceCents: 10000 } })).toBe(false);
    expect(isEligible(e, { filters: { ...EMPTY_FILTERS, retailerIds: ['r1'], maxPriceCents: 15000 } })).toBe(true);
  });
});

describe('chunk', () => {
  it('splits into fixed-size pieces', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('deck refill and exhaustion', () => {
  it('refills only when ready, low, idle and more remain', () => {
    const base = { ready: true, more: true, refill: 'idle' as const, cardsLeft: REFILL_AT };
    expect(shouldRefill(base)).toBe(true);
    expect(shouldRefill({ ...base, cardsLeft: REFILL_AT + 1 })).toBe(false);
    expect(shouldRefill({ ...base, more: false })).toBe(false);
    expect(shouldRefill({ ...base, ready: false })).toBe(false);
    expect(shouldRefill({ ...base, refill: 'loading' })).toBe(false);
    expect(shouldRefill({ ...base, refill: 'failed' })).toBe(false);
  });

  it('shows "seen everything" only when nothing eligible is left', () => {
    expect(deckStatusFor({ status: 'ready', cardsLeft: 0, more: false, refill: 'idle' })).toBe('ready'); // empty = exhausted
    expect(deckStatusFor({ status: 'ready', cardsLeft: 0, more: true, refill: 'loading' })).toBe('loading');
    expect(deckStatusFor({ status: 'ready', cardsLeft: 0, more: true, refill: 'idle' })).toBe('loading');
    expect(deckStatusFor({ status: 'ready', cardsLeft: 0, more: true, refill: 'failed' })).toBe('error');
    expect(deckStatusFor({ status: 'ready', cardsLeft: 3, more: true, refill: 'failed' })).toBe('ready'); // keep swiping
    expect(deckStatusFor({ status: 'error', cardsLeft: 0, more: false, refill: 'idle' })).toBe('error');
  });
});

describe('local catalog and the recommender', () => {
  const catalog = generateCatalog();
  const repo = new LocalProductRepository(catalog, CATEGORIES, SUBCATEGORIES, RETAILERS);

  it('small catalogs: candidates are exactly what the deck got before, so ranking is unchanged', async () => {
    const swipes: SwipeEvent[] = catalog.slice(0, 12).map((p, i) => ({
      id: `s${i}`,
      productId: p.id,
      categoryId: p.categoryId,
      direction: i % 3 === 0 ? 'skip' : 'keep',
      swipedAt: 1_700_000_000_000 + i * 60_000,
    }));
    const swiped = new Set(swipes.map((s) => s.productId));
    const bands = computePriceBands(catalog);
    const model = buildTasteModel({ swipes, products: new Map(catalog.map((p) => [p.id, p])), bands });
    const before = await repo.listProducts({ excludeIds: swiped });
    const batch = await repo.listCandidates({ excludeIds: swiped, seed: 9 });
    expect(batch.complete).toBe(true);
    expect(batch.products).toEqual(before);
    const opts = { bands, seed: 42 };
    expect(rankDeck(batch.products, model, opts)).toEqual(rankDeck(before, model, opts));
  });

  it('large local catalogs are drawn evenly too', async () => {
    const big = generateCatalog({ perSubcategory: 200 });
    const bigRepo = new LocalProductRepository(big, CATEGORIES, SUBCATEGORIES, RETAILERS);
    const batch = await bigRepo.listCandidates({ seed: 1 });
    expect(batch.products).toHaveLength(CANDIDATE_POOL_SIZE);
    expect(batch.eligible).toBe(2200);
    expect(batch.complete).toBe(false);
    const lastQuarter = new Set(big.slice(1650).map((p) => p.id));
    expect(batch.products.filter((p) => lastQuarter.has(p.id)).length).toBeGreaterThan(150);
  });
});
