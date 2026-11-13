import type { SwipeDirection } from '@/domain/types';
import { restoreCard, takeCard, undoTarget, type HistoryEntry } from '../deckState';

type Card = { product: { id: string } };
const c = (id: string): Card => ({ product: { id } });
const ids = (cards: readonly Card[]) => cards.map((x) => x.product.id);
const logged = (productId: string, direction: SwipeDirection) => ({ productId, direction });

describe('takeCard: commit the card that actually flew out', () => {
  it('takes the top card', () => {
    const r = takeCard([c('a'), c('b'), c('c')], 'a')!;
    expect(r.card.product.id).toBe('a');
    expect(ids(r.rest)).toEqual(['b', 'c']);
  });

  it('takes it from wherever it is, leaving every other card in place (the old bug dropped A)', () => {
    // Undo put A back on top while B was still flying out; B then lands.
    const r = takeCard([c('a'), c('b'), c('c')], 'b')!;
    expect(r.card.product.id).toBe('b');
    expect(ids(r.rest)).toEqual(['a', 'c']);
  });

  it('does nothing for a product that is no longer in the deck (late or duplicate landing)', () => {
    expect(takeCard([c('a'), c('c')], 'b')).toBeNull();
    expect(takeCard([], 'a')).toBeNull();
  });
});

describe('undoTarget: Undo reverses the newest committed swipe', () => {
  const history: HistoryEntry<Card>[] = [
    { card: c('a'), direction: 'skip' },
    { card: c('b'), direction: 'keep' },
  ];

  it('targets the newest entry when the log agrees', () => {
    expect(undoTarget(history, logged('b', 'keep'))?.card.product.id).toBe('b');
  });

  it('refuses when the log disagrees (another product, or the same product the other way)', () => {
    expect(undoTarget(history, logged('a', 'skip'))).toBeNull();
    expect(undoTarget(history, logged('b', 'skip'))).toBeNull();
    expect(undoTarget(history, undefined)).toBeNull();
    expect(undoTarget([], logged('b', 'keep'))).toBeNull();
  });
});

describe('restoreCard', () => {
  it('puts the card back on top exactly once', () => {
    expect(ids(restoreCard([c('c'), c('d')], c('b')))).toEqual(['b', 'c', 'd']);
    expect(ids(restoreCard([c('b'), c('c')], c('b')))).toEqual(['b', 'c']);
  });
});

describe('a whole rapid sequence, step by step (what useDeck does with these)', () => {
  /** A tiny model of the deck + swipe log, driven only by the pure functions. */
  function run(steps: ({ swipe: [string, SwipeDirection] } | { undo: true })[]) {
    let cards = ['a', 'b', 'c', 'd', 'e'].map(c);
    let history: HistoryEntry<Card>[] = [];
    const log: { productId: string; direction: SwipeDirection }[] = [];
    for (const step of steps) {
      if ('swipe' in step) {
        const [id, direction] = step.swipe;
        const taken = takeCard(cards, id);
        if (!taken) continue;
        cards = taken.rest;
        history = [...history, { card: taken.card, direction }];
        log.push({ productId: id, direction });
      } else {
        const target = undoTarget(history, log.at(-1));
        if (!target) {
          history = [];
          continue;
        }
        log.pop();
        cards = restoreCard(cards, target.card);
        history = history.slice(0, -1);
      }
    }
    return { cards: ids(cards), log: log.map((l) => `${l.direction}:${l.productId}`) };
  }

  it('Skip → Keep → Undo undoes the Keep only', () => {
    expect(run([{ swipe: ['a', 'skip'] }, { swipe: ['b', 'keep'] }, { undo: true }])).toEqual({
      cards: ['b', 'c', 'd', 'e'],
      log: ['skip:a'],
    });
  });

  it('Undo three times in a row walks back one at a time and stops at the start', () => {
    expect(
      run([{ swipe: ['a', 'skip'] }, { swipe: ['b', 'keep'] }, { undo: true }, { undo: true }, { undo: true }]),
    ).toEqual({ cards: ['a', 'b', 'c', 'd', 'e'], log: [] });
  });

  it('a landing that arrives after Undo restored an older card commits the right one and keeps the rest', () => {
    // Undo A (back on top), then B's landing arrives: B goes, A stays.
    expect(run([{ swipe: ['a', 'skip'] }, { undo: true }, { swipe: ['b', 'keep'] }])).toEqual({
      cards: ['a', 'c', 'd', 'e'],
      log: ['keep:b'],
    });
  });

  it('never duplicates or loses a card', () => {
    const r = run([
      { swipe: ['a', 'skip'] },
      { swipe: ['b', 'keep'] },
      { undo: true },
      { swipe: ['b', 'skip'] },
      { swipe: ['b', 'skip'] }, // a duplicate landing is ignored
      { undo: true },
      { undo: true },
    ]);
    expect(r.cards).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(r.cards).size).toBe(r.cards.length);
  });
});
