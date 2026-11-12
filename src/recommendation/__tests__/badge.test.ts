import type { Product, SwipeEvent } from '../../domain/types';
import { generateCatalog } from '../../data/sample/catalog';
import {
  badgeLabel,
  badgeSpoken,
  cardBadge,
  isClearLike,
  LEARNING_TEXT,
  listingSupports,
  MAX_LABELS_CHARS,
  type CardBadge,
} from '../badge';
import { computePriceBands, type RankedProduct } from '../engine';
import { buildTasteModel, EMPTY_MODEL } from '../model';
import { rankDeck } from '../rank';
import type { Feedback } from '../signals';

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

/** A shopper who keeps walnut and skips velvet, over 40 swipes (as in summary.test.ts). */
function walnutModel(feedback: Feedback[] = []) {
  const walnut = catalog.filter((p) => p.material === 'walnut').slice(0, 14);
  const velvet = catalog.filter((p) => p.material === 'velvet').slice(0, 14);
  const other = catalog.filter((p) => p.material !== 'walnut' && p.material !== 'velvet').slice(0, 12);
  const swipes = [
    ...walnut.map((p, i) => swipe(p, 'keep', i * 3)),
    ...velvet.map((p, i) => swipe(p, 'skip', i * 3 + 1)),
    ...other.map((p, i) => swipe(p, i % 3 === 0 ? 'keep' : 'skip', i * 3 + 2)),
  ];
  return buildTasteModel({ swipes, products, bands, feedback });
}
const more = (featureKey: string, at = 1000): Feedback => ({
  id: `m-${featureKey}`,
  at,
  kind: 'feature',
  featureKey,
  answer: 'more',
});
const less = (featureKey: string, at = 1000): Feedback => ({
  id: `l-${featureKey}`,
  at,
  kind: 'feature',
  featureKey,
  answer: 'less',
});

/** A real catalog product with chosen attributes and listing text. */
function product(over: Partial<Product>): Product {
  return { ...catalog[0], styleTags: [], material: '', color: '', ...over };
}
const card = (p: Product, explored = false): RankedProduct => ({ product: p, score: 0, reasons: [], explored });

describe('listingSupports: only what the store clearly says', () => {
  const L = (title: string, description = '') => ({ title, description });

  it('accepts real wood only with an explicit cue', () => {
    expect(listingSupports(L('Solid Oak Dining Table'), 'oak', 'material')).toBe(true);
    expect(listingSupports(L('Dresser', 'Built with an oak wood frame.'), 'oak', 'material')).toBe(true);
    expect(listingSupports(L('Bench', 'Made from solid walnut.'), 'walnut', 'material')).toBe(true);
  });

  it('rejects finish names and appearance words for woods', () => {
    expect(listingSupports(L('Savanna Dresser in Reclaimed Caramel Oak'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Oak-Look Coffee Table'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Table', 'Oak effect top with oak finish legs'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Console', 'Oak wood grain laminate'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Engineered Oak Nightstand'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Oakland Chair'), 'oak', 'material')).toBe(false);
  });

  it('rejects fake or negated materials', () => {
    expect(listingSupports(L('Faux Leather Armchair'), 'leather', 'material')).toBe(false);
    expect(listingSupports(L('Chair', 'PU leather seat'), 'leather', 'material')).toBe(false);
    expect(listingSupports(L('Outdoor Set', 'Woven PE rattan'), 'rattan', 'material')).toBe(false);
    expect(listingSupports(L('Cabinet', 'Doors with no rattan panels'), 'rattan', 'material')).toBe(false);
    expect(listingSupports(L('Shelf', 'Not solid oak: engineered board'), 'oak', 'material')).toBe(false);
    expect(listingSupports(L('Rattan-Look Headboard'), 'rattan', 'material')).toBe(false);
  });

  it('accepts plainly stated non-wood materials, accents ignored', () => {
    expect(listingSupports(L('Genuine Leather Sofa'), 'leather', 'material')).toBe(true);
    expect(listingSupports(L('Rattan Nightstand'), 'rattan', 'material')).toBe(true);
    expect(listingSupports(L('Chair', 'Wrapped in lush bouclé fabric'), 'boucle', 'material')).toBe(true);
  });

  it('does not take a style from a finish name', () => {
    expect(listingSupports(L('Cas Nightstand in Coastal Oak'), 'coastal', 'style')).toBe(false);
    expect(listingSupports(L('Coastal Rattan Nightstand'), 'coastal', 'style')).toBe(true);
    expect(listingSupports(L('Midcentury Modern Chair'), 'mid-century', 'style')).toBe(true);
    expect(listingSupports(L('Mid Century Sofa'), 'mid-century', 'style')).toBe(true);
  });

  it("doesn't take a colour from a small part", () => {
    expect(listingSupports(L('Dresser with Black Handles'), 'black', 'color')).toBe(false);
    expect(listingSupports(L('Nightstand in Black Oak'), 'black', 'color')).toBe(true);
    expect(listingSupports(L('Sofa', 'Available in many shades, not black'), 'black', 'color')).toBe(false);
  });

  it('copes with a missing or empty description', () => {
    expect(
      listingSupports({ title: 'Rattan Chair', description: undefined as unknown as string }, 'rattan', 'material'),
    ).toBe(true);
    expect(listingSupports(L('', ''), 'rattan', 'material')).toBe(false);
    expect(listingSupports(L('Rattan Chair'), '', 'material')).toBe(false);
  });
});

describe('cardBadge', () => {
  const walnut = walnutModel();
  const solidWalnut = product({ title: 'Solid Walnut Dresser', description: '', material: 'walnut', color: 'cream' });

  it('says "Still learning your style" only in the learning stage', () => {
    expect(cardBadge(card(solidWalnut), EMPTY_MODEL, bands)).toEqual({ kind: 'learning' });
    // After 10 swipes the learning stage ends even with no keeps: no indefinite learning pill.
    const skips = catalog.slice(0, 10).map((p, i) => swipe(p, 'skip', i));
    const after = buildTasteModel({ swipes: skips, products, bands });
    expect(cardBadge(card(solidWalnut), after, bands)?.kind).not.toBe('learning');
  });

  it('names a strong, ranked, stated like', () => {
    expect(isClearLike(walnut, 'material:walnut')).toBe(true);
    expect(cardBadge(card(solidWalnut), walnut, bands)).toEqual({ kind: 'match', labels: ['walnut'] });
  });

  it('names nothing for a dislike, a weak lean, or a like the listing does not back up', () => {
    const velvet = product({ title: 'Velvet Sofa', material: 'velvet', color: 'cream' });
    expect(isClearLike(walnut, 'material:velvet')).toBe(false);
    expect(cardBadge(card(velvet), walnut, bands)).toBeNull();
    const finishOnly = product({ title: 'Dresser in Walnut', material: 'walnut', color: 'cream' });
    expect(cardBadge(card(finishOnly), walnut, bands)).toBeNull();
  });

  it('names two independently supported attributes, strongest first', () => {
    const model = walnutModel([more('color:black')]);
    const p = product({ title: 'Solid Walnut Cabinet in Black', material: 'walnut', color: 'black' });
    const b = cardBadge(card(p), model, bands);
    expect(b?.kind).toBe('match');
    expect(b && b.kind === 'match' ? [...b.labels].sort() : []).toEqual(['black', 'walnut']);
  });

  it('respects "Show me less" and "Show me more"', () => {
    expect(cardBadge(card(solidWalnut), walnutModel([less('material:walnut')]), bands)).toBeNull();
    const boosted = walnutModel([more('style:coastal')]);
    expect(isClearLike(boosted, 'style:coastal')).toBe(true);
  });

  it("never names brand, store or price, only the product's own style / material / colour", () => {
    for (const p of catalog.slice(0, 120)) {
      const b = cardBadge(card(p), walnut, bands);
      if (b?.kind !== 'match') continue;
      for (const label of b.labels)
        expect([...p.styleTags, p.material, p.color].map((x) => x.toLowerCase())).toContain(label);
    }
  });

  it('shows no badge on exploration cards', () => {
    expect(cardBadge(card(solidWalnut, true), walnut, bands)).toBeNull();
  });

  it('keeps labels short: one label when two would be too long, and skips very long labels', () => {
    const model = walnutModel([more('style:scandinavian'), more('color:charcoal-grey')]);
    const long = product({
      title: 'Scandinavian Solid Walnut Sideboard in Charcoal-Grey',
      styleTags: ['scandinavian'],
      material: 'walnut',
      color: 'charcoal-grey',
    });
    const b = cardBadge(card(long), model, bands);
    expect(b?.kind).toBe('match');
    if (b?.kind === 'match') expect(b.labels.join(', ').length).toBeLessThanOrEqual(MAX_LABELS_CHARS);
    const tooLong = walnutModel([more('style:contemporary-farmhouse')]);
    const p2 = product({
      title: 'Contemporary Farmhouse Table',
      styleTags: ['contemporary-farmhouse'],
      material: '',
      color: '',
    });
    expect(cardBadge(card(p2), tooLong, bands)).toBeNull();
  });

  it('says the same thing visibly and to screen readers', () => {
    const match: CardBadge = { kind: 'match', labels: ['oak', 'black'] };
    expect(badgeLabel(match)).toBe('oak, black');
    expect(badgeSpoken(match)).toBe('Picked for you: oak and black');
    expect(badgeLabel({ kind: 'learning' })).toBe(LEARNING_TEXT);
    expect(badgeSpoken({ kind: 'learning' })).toBe(LEARNING_TEXT);
    expect(badgeLabel(null)).toBeNull();
    expect(badgeSpoken(null)).toBeNull();
  });

  it('leaves ranking untouched: same order, scores and reasons, inputs not changed', () => {
    const rank = () => rankDeck(catalog, walnut, { bands, seed: 42 });
    const before = JSON.stringify(rank());
    const ranked = rank();
    ranked.forEach((r) => cardBadge(r, walnut, bands));
    expect(JSON.stringify(ranked)).toBe(before);
    expect(JSON.stringify(rank())).toBe(before);
  });
});
