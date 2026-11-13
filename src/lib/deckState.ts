/**
 * The deck's record of what was swiped, kept consistent however fast Keep, Skip and Undo come
 * in (audit P2 "Undo timing"). Pure, so it's unit-tested.
 *
 * - A swipe is committed for a specific product id (the card that actually flew out), never
 *   "whatever is on top right now", so an Undo that changed the order can't make the wrong
 *   card disappear.
 * - Undo always reverses the newest committed swipe, and only if the swipe log agrees.
 */
import type { SwipeDirection } from '@/domain/types';

interface HasProduct {
  product: { id: string };
}

export interface HistoryEntry<C extends HasProduct> {
  card: C;
  direction: SwipeDirection;
}

/** Takes the card for `productId` out of the deck (wherever it is), or null if it isn't there. */
export function takeCard<C extends HasProduct>(cards: readonly C[], productId: string): { card: C; rest: C[] } | null {
  const i = cards.findIndex((c) => c.product.id === productId);
  if (i < 0) return null;
  return { card: cards[i]!, rest: [...cards.slice(0, i), ...cards.slice(i + 1)] };
}

/**
 * What Undo should reverse: the newest entry of this deck's history, if the newest swipe in the
 * log is that same product and direction. Otherwise null (something else changed the log, e.g.
 * another deck), and the history should be dropped.
 */
export function undoTarget<C extends HasProduct>(
  history: readonly HistoryEntry<C>[],
  lastLogged: { productId: string; direction: SwipeDirection } | undefined,
): HistoryEntry<C> | null {
  const last = history.at(-1);
  if (!last || !lastLogged) return null;
  return last.card.product.id === lastLogged.productId && last.direction === lastLogged.direction ? last : null;
}

/** The deck after Undo: the card back on top, never twice. */
export function restoreCard<C extends HasProduct>(cards: readonly C[], card: C): C[] {
  return [card, ...cards.filter((c) => c.product.id !== card.product.id)];
}
