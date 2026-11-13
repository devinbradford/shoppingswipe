import { generateCatalog } from '@/data/sample/catalog';
import type { Product, SwipeEvent } from '@/domain/types';
import { computePriceBands } from '../engine';
import {
  factsChanged,
  factsOf,
  FEATURE_VERSION,
  productFromFacts,
  withHistoricalFacts,
  type ProductFacts,
} from '../historicalFacts';
import { buildTasteModel } from '../model';
import { rankDeck } from '../rank';
import type { EngagementSignal } from '../signals';

const catalog = generateCatalog();
const bands = computePriceBands(catalog);

describe('product facts', () => {
  it('hold only what the engine reads: no name, photos or purchase link', () => {
    const f = factsOf(catalog[0]!, 123);
    expect(f.featureVersion).toBe(FEATURE_VERSION);
    expect(f.capturedAt).toBe(123);
    const json = JSON.stringify(f);
    expect(json).not.toContain(catalog[0]!.title);
    expect(json).not.toContain(catalog[0]!.productUrl);
    expect(json).not.toContain('imageUrls');
  });

  it('notice any change to an attribute the engine reads (and nothing else)', () => {
    const p = catalog[0]!;
    const f = factsOf(p, 1);
    expect(factsChanged(f, p)).toBe(false);
    expect(factsChanged(f, { ...p, title: 'Renamed', imageUrls: [] })).toBe(false);
    expect(factsChanged(f, { ...p, priceCents: p.priceCents + 1 })).toBe(true);
    expect(factsChanged(f, { ...p, material: 'steel' })).toBe(true);
    expect(factsChanged(f, { ...p, styleTags: [...p.styleTags, 'extra'] })).toBe(true);
    expect(factsChanged(f, { ...p, retailerId: 'other' })).toBe(true);
    expect(factsChanged({ ...f, featureVersion: 0 }, p)).toBe(true);
    expect(factsChanged(undefined, p)).toBe(true);
  });
});

describe('withHistoricalFacts', () => {
  const live = catalog[0]!;
  const gone = catalog[1]!;
  const facts: Record<string, ProductFacts> = {
    [live.id]: { ...factsOf(live, 1), material: 'OLD MATERIAL', priceCents: 1 },
    [gone.id]: factsOf(gone, 1),
  };

  it('live catalog records always win over saved facts', () => {
    const merged = withHistoricalFacts(new Map([[live.id, live]]), facts, [live.id, gone.id]);
    expect(merged.get(live.id)).toBe(live);
  });

  it('fills in only the needed ids the catalog did not return', () => {
    const merged = withHistoricalFacts(new Map([[live.id, live]]), facts, [live.id, gone.id]);
    expect(merged.get(gone.id)?.material).toBe(gone.material);
    expect(withHistoricalFacts(new Map(), facts, []).size).toBe(0);
    expect(withHistoricalFacts(new Map(), facts, ['unknown']).size).toBe(0);
  });
});

describe('V2 is unchanged when the same product information is available', () => {
  // A realistic history: 60 swipes with keeps and skips, plus engagement signals.
  const swiped = catalog.slice(0, 60);
  const swipes: SwipeEvent[] = swiped.map((p, i) => ({
    id: `s${i}`,
    productId: p.id,
    categoryId: p.categoryId,
    direction: i % 3 === 0 ? 'skip' : 'keep',
    swipedAt: 1_700_000_000_000 + i * 60_000,
  }));
  const signals: EngagementSignal[] = [
    { id: 'g1', productId: swiped[2]!.id, type: 'list_add', at: 1_700_000_100_000 },
    { id: 'g2', productId: swiped[5]!.id, type: 'purchase', at: 1_700_000_200_000 },
    { id: 'g3', productId: swiped[9]!.id, type: 'swipe_dwell', at: 1_700_000_300_000, value: 400 },
  ];
  const liveMap = new Map<string, Product>(swiped.map((p) => [p.id, p]));
  const factsMap = new Map<string, Product>(swiped.map((p) => [p.id, productFromFacts(factsOf(p, 1))]));

  it('the taste model built from saved facts is identical to the one built from live records', () => {
    const fromLive = buildTasteModel({ swipes, products: liveMap, bands, signals });
    const fromFacts = buildTasteModel({ swipes, products: factsMap, bands, signals });
    expect(fromFacts).toEqual(fromLive);
  });

  it('so ranking is identical too', () => {
    const candidates = catalog.slice(60, 160);
    const a = rankDeck(candidates, buildTasteModel({ swipes, products: liveMap, bands, signals }), { bands, seed: 11 });
    const b = rankDeck(candidates, buildTasteModel({ swipes, products: factsMap, bands, signals }), { bands, seed: 11 });
    expect(b).toEqual(a);
  });

  it('merging adds nothing when every product is live (V2 behaviour exactly)', () => {
    const allFacts = Object.fromEntries(swiped.map((p) => [p.id, { ...factsOf(p, 1), material: 'X' }]));
    const merged = withHistoricalFacts(liveMap, allFacts, swiped.map((p) => p.id));
    expect(buildTasteModel({ swipes, products: merged, bands, signals })).toEqual(
      buildTasteModel({ swipes, products: liveMap, bands, signals }),
    );
  });
});
