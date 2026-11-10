import { CATEGORIES, RETAILERS, SUBCATEGORIES, generateCatalog } from '../../data/sample/catalog';
import { ROOMS } from '../../data/rooms';
import { computePriceBands } from '../engine';
import { buildTasteModel } from '../model';
import { rankDeck, rerankDeck } from '../rank';
import {
  currentAnswers,
  lovedStyles,
  roomReveal,
  roomScores,
  roomSeeds,
  SEED_CAP,
  SEED_EVIDENCE_CAP,
  type RoomAnswer,
  type RoomProfile,
} from '../rooms';
import { makeShopper, utility, type Shopper } from '../sim/simulate';
import type { Product, SwipeEvent } from '../../domain/types';

const room = (id: string, attributes: RoomProfile['attributes'], style = id): RoomProfile => ({
  id,
  version: 1,
  style,
  attributes,
});
const A: RoomProfile = room(
  'a',
  { style: { 'mid-century': 1 }, material: { walnut: 1 }, wood: { dark: 1 } },
  'mid-century',
);
const B: RoomProfile = room(
  'b',
  { style: { classic: 1 }, material: { walnut: 0.6, velvet: 1 }, wood: { dark: 0.8 } },
  'classic',
);
const C: RoomProfile = room('c', { style: { coastal: 1 }, material: { rattan: 1 }, wood: { light: 1 } }, 'coastal');
const D: RoomProfile = room('d', { style: { bohemian: 1 }, material: { rattan: 0.8 }, wood: { mid: 0.6 } }, 'bohemian');
const ROOMSET = [A, B, C, D];
const ans = (roomId: string, love: boolean, at = 1, version = 1): RoomAnswer => ({ roomId, version, love, at });

describe('room answers → starting taste', () => {
  it('a love adds the room’s weights, a pass takes away half', () => {
    const s = roomScores([ans('a', true), ans('b', false)], ROOMSET);
    expect(s.get('material:walnut')).toBeCloseTo(1 - 0.5 * 0.6);
    expect(s.get('style:classic')).toBeCloseTo(-0.5);
  });

  it('ignores answers about an old photo and keeps the latest answer per room', () => {
    const answers = [ans('a', true, 1, 0), ans('c', true, 1), ans('c', false, 2)];
    expect(currentAnswers(answers, ROOMSET)).toEqual([ans('c', false, 2)]);
  });

  it('seeds only what products can carry, capped', () => {
    const seeds = roomSeeds([ans('a', true), ans('b', true)], ROOMSET);
    expect(seeds.some((f) => f.key.startsWith('wood:'))).toBe(false);
    const walnut = seeds.find((f) => f.key === 'material:walnut')!;
    expect(walnut.mean).toBeLessThanOrEqual(SEED_CAP);
    expect(walnut.evidence).toBeLessThanOrEqual(SEED_EVIDENCE_CAP);
    expect(lovedStyles([ans('a', true), ans('c', false)], ROOMSET)).toEqual(['mid-century']);
  });

  it('names a trait only when two loved rooms agree, at most one per kind', () => {
    const r = roomReveal([ans('a', true), ans('b', true), ans('c', false), ans('d', false)], ROOMSET);
    expect(r.likes.map((t) => t.label)).toEqual(['Dark wood', 'Walnut']);
    expect(r.likes[0].reason).toBe('In 2 of the 2 rooms you loved.');
    expect(r.dislike?.label).toBe('Rattan and cane');
    const one = roomReveal([ans('a', true), ans('c', true)], ROOMSET);
    expect(one.likes).toEqual([]);
  });

  it('the model takes room seeds as fading starting guesses', () => {
    const products = new Map<string, Product>();
    const seedFeatures = roomSeeds([ans('a', true), ans('b', true)], ROOMSET);
    const m0 = buildTasteModel({ swipes: [], products, bands: {}, seedFeatures });
    expect(m0.weights['material:walnut'].mean).toBeGreaterThan(0);
    // One loved room is too little to leave the varied cold-start deck; two are enough.
    const one = roomSeeds([ans('a', true)], ROOMSET);
    expect(buildTasteModel({ swipes: [], products, bands: {}, seedFeatures: one }).seeded).toBe(false);
    expect(m0.seeded).toBe(true);
    const all = roomSeeds([ans('a', true), ans('b', true), ans('c', true), ans('d', true)], ROOMSET);
    expect(buildTasteModel({ swipes: [], products, bands: {}, seedFeatures: all }).seeded).toBe(true);
  });

  it('every real room record is complete', () => {
    for (const r of ROOMS) {
      expect(r.alt.length).toBeGreaterThan(20);
      expect(Object.keys(r.attributes.style ?? {})).toContain(r.style);
      for (const kind of Object.values(r.attributes))
        for (const w of Object.values(kind ?? {})) expect(w > 0 && w <= 1).toBe(true);
    }
  });
});

/** A simulated shopper loves a room when what it shows lines up with their hidden taste. */
function answerRooms(shopper: Shopper): RoomAnswer[] {
  return ROOMS.map((r, i) => {
    let u = 0;
    for (const kind of ['style', 'color', 'material'] as const)
      for (const [v, w] of Object.entries(r.attributes[kind] ?? {})) u += w * (shopper.weights[`${kind}:${v}`] ?? 0);
    return { roomId: r.id, version: r.version, love: u > 0.15, at: i };
  });
}

function firstCardsKeepRate(shopper: Shopper, catalog: Product[], seeded: boolean, cards = 20): number {
  const bands = computePriceBands(catalog);
  const products = new Map(catalog.map((p) => [p.id, p]));
  const seedFeatures = seeded ? roomSeeds(answerRooms(shopper), ROOMS) : [];
  const swipes: SwipeEvent[] = [];
  const model = () => buildTasteModel({ swipes, products, bands, seedFeatures });
  let deck = rankDeck(catalog, model(), { bands, seed: shopper.id });
  let keeps = 0;
  for (let i = 0; i < cards && deck.length; i++) {
    const [top, ...rest] = deck;
    const keep = utility(shopper, top.product, bands) > 0.3;
    if (keep) keeps++;
    swipes.push({
      id: `s${i}`,
      productId: top.product.id,
      categoryId: top.product.categoryId,
      direction: keep ? 'keep' : 'skip',
      swipedAt: 1000 + i,
    });
    deck = rerankDeck(rest, model(), { bands, seed: shopper.id + i + 1, position: i + 1 });
  }
  return keeps / cards;
}

describe('rooms improve the first cards (simulated shoppers)', () => {
  it('keep rate of the first 20 cards is higher with room answers than without', () => {
    const catalog = generateCatalog();
    void CATEGORIES;
    void SUBCATEGORIES;
    void RETAILERS;
    let withRooms = 0;
    let without = 0;
    const n = 40;
    for (let id = 1; id <= n; id++) {
      const s1 = makeShopper(id, catalog, false);
      const s2 = makeShopper(id, catalog, false);
      withRooms += firstCardsKeepRate(s1, catalog, true);
      without += firstCardsKeepRate(s2, catalog, false);
    }
    const lift = withRooms / n - without / n;
    // Printed for the record; the guard is that rooms never make the start worse.
    console.log(`first-20 keep rate: rooms ${(withRooms / n).toFixed(3)} vs none ${(without / n).toFixed(3)}`);
    expect(lift).toBeGreaterThan(0);
  });
});
