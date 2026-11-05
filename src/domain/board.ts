/**
 * Rules for the Kept and list boards: filter by room, sort, totals, and the text
 * sent when a list is shared. Pure: no React, no storage.
 */
import type { CategoryId, Product } from './types';

export type BoardSort = 'newest' | 'price-asc' | 'price-desc';

export const BOARD_SORTS: { id: BoardSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

/**
 * The pieces to show. `products` arrives newest first (the order they were kept or added);
 * price sorts keep that order for equal prices.
 */
export function arrangeBoard(
  products: readonly Product[],
  { room, sort, only }: { room: CategoryId | null; sort: BoardSort; only?: ReadonlySet<string> },
): Product[] {
  const shown = products.filter((p) => (!room || p.categoryId === room) && (!only || only.has(p.id)));
  if (sort === 'newest') return shown;
  const dir = sort === 'price-asc' ? 1 : -1;
  return shown
    .map((p, i) => ({ p, i }))
    .sort((a, b) => dir * (a.p.priceCents - b.p.priceCents) || a.i - b.i)
    .map(({ p }) => p);
}

/** How many pieces each room has, for the room chips. */
export function roomCounts(products: readonly Product[]): Partial<Record<CategoryId, number>> {
  const out: Partial<Record<CategoryId, number>> = {};
  for (const p of products) out[p.categoryId] = (out[p.categoryId] ?? 0) + 1;
  return out;
}

export interface BoardTotal {
  count: number;
  /** Sum of prices in cents. Null when pieces are priced in more than one currency. */
  totalCents: number | null;
  currency: string;
}

export function boardTotal(products: readonly Product[]): BoardTotal {
  const currencies = new Set(products.map((p) => p.currency));
  const currency = products[0]?.currency ?? 'USD';
  return {
    count: products.length,
    totalCents: currencies.size > 1 ? null : products.reduce((sum, p) => sum + p.priceCents, 0),
    currency,
  };
}

/** "6 pieces · $4,280", or just "6 pieces" when currencies are mixed. */
export function formatBoardTotal(total: BoardTotal, formatPrice: (cents: number, currency: string) => string): string {
  const pieces = `${total.count} ${total.count === 1 ? 'piece' : 'pieces'}`;
  return total.totalCents === null || total.count === 0
    ? pieces
    : `${pieces} · ${formatPrice(total.totalCents, total.currency)}`;
}

/**
 * What goes into the phone's share sheet for a list: a heading, then each piece
 * with its price, store and link.
 */
export function shareListText(
  listName: string,
  products: readonly Product[],
  {
    storeName,
    linkFor,
    formatPrice,
  }: {
    storeName: (p: Product) => string | undefined;
    linkFor: (p: Product) => string;
    formatPrice: (cents: number, currency: string) => string;
  },
): string {
  const heading = `My "${listName}" list on CureAvo (${formatBoardTotal(boardTotal(products), formatPrice)})`;
  const lines = products.map((p, i) => {
    const store = storeName(p);
    const price = formatPrice(p.priceCents, p.currency);
    return `${i + 1}. ${p.title}, ${price}${store ? ` at ${store}` : ''}\n${linkFor(p)}`;
  });
  return [heading, ...lines].join('\n\n');
}
