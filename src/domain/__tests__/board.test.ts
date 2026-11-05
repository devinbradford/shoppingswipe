import { generateCatalog } from '../../data/sample/catalog';
import { formatPrice } from '../../lib/format';
import { arrangeBoard, boardTotal, formatBoardTotal, roomCounts, shareListText } from '../board';
import type { Product } from '../types';

const catalog = generateCatalog();
const sample: Product[] = [
  catalog.find((p) => p.categoryId === 'bedroom')!,
  catalog.find((p) => p.categoryId === 'living-room')!,
  catalog.filter((p) => p.categoryId === 'living-room')[1],
  catalog.find((p) => p.categoryId === 'kitchen-dining')!,
];

describe('arrangeBoard', () => {
  it('keeps newest-first order and filters by room', () => {
    expect(arrangeBoard(sample, { room: null, sort: 'newest' })).toEqual(sample);
    const living = arrangeBoard(sample, { room: 'living-room', sort: 'newest' });
    expect(living.map((p) => p.id)).toEqual([sample[1].id, sample[2].id]);
  });

  it('sorts by price both ways without changing the input', () => {
    const before = sample.map((p) => p.id);
    const up = arrangeBoard(sample, { room: null, sort: 'price-asc' }).map((p) => p.priceCents);
    const down = arrangeBoard(sample, { room: null, sort: 'price-desc' }).map((p) => p.priceCents);
    expect(up).toEqual([...up].sort((a, b) => a - b));
    expect(down).toEqual([...up].reverse());
    expect(sample.map((p) => p.id)).toEqual(before);
  });

  it('can narrow to a set of ids (e.g. bought pieces)', () => {
    const only = new Set([sample[2].id, sample[0].id]);
    expect(arrangeBoard(sample, { room: null, sort: 'newest', only }).map((p) => p.id)).toEqual([
      sample[0].id,
      sample[2].id,
    ]);
  });

  it('keeps equal prices in kept order', () => {
    const a = { ...sample[0], id: 'a', priceCents: 500 };
    const b = { ...sample[1], id: 'b', priceCents: 500 };
    expect(arrangeBoard([a, b], { room: null, sort: 'price-desc' }).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('totals', () => {
  it('counts rooms', () => {
    expect(roomCounts(sample)).toEqual({ bedroom: 1, 'living-room': 2, 'kitchen-dining': 1 });
  });

  it('adds prices and words the total', () => {
    const t = boardTotal(sample);
    expect(t.totalCents).toBe(sample.reduce((s, p) => s + p.priceCents, 0));
    expect(formatBoardTotal(t, formatPrice)).toMatch(/^4 pieces · \$[\d,]+$/);
    expect(formatBoardTotal(boardTotal([sample[0]]), formatPrice)).toMatch(/^1 piece · /);
    expect(formatBoardTotal(boardTotal([]), formatPrice)).toBe('0 pieces');
  });

  it('does not add up mixed currencies', () => {
    const t = boardTotal([sample[0], { ...sample[1], currency: 'EUR' }]);
    expect(t.totalCents).toBeNull();
    expect(formatBoardTotal(t, formatPrice)).toBe('2 pieces');
  });
});

describe('shareListText', () => {
  it('lists each piece with price, store and link under a heading', () => {
    const text = shareListText('Living room', sample.slice(1, 3), {
      storeName: () => 'Atelier Oro',
      linkFor: (p) => p.productUrl,
      formatPrice,
    });
    expect(text.startsWith('My "Living room" list on CureAvo (2 pieces · $')).toBe(true);
    expect(text).toContain(
      `1. ${sample[1].title}, ${formatPrice(sample[1].priceCents)} at Atelier Oro\n${sample[1].productUrl}`,
    );
    expect(text).toContain(`2. ${sample[2].title}`);
  });

  it('leaves out the store when unknown', () => {
    const text = shareListText('Ideas', [sample[0]], { storeName: () => undefined, linkFor: () => 'x', formatPrice });
    expect(text).toContain(`${formatPrice(sample[0].priceCents)}\nx`);
  });
});
