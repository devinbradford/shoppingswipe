/**
 * Pure wishlist rules. No React, no storage: the store calls these and saves
 * whatever they return, so the rules are easy to test.
 */
import type { Wishlist } from './types';

export const WISHLIST_NAME_MAX = 40;
export const WISHLIST_LIMIT = 50;

export type WishlistResult = { ok: true; lists: Wishlist[]; id: string } | { ok: false; error: string };

/** Collapse whitespace and trim. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Returns an error message, or null if the name is fine. */
export function validateName(name: string, lists: readonly Wishlist[], ignoreId?: string): string | null {
  const clean = cleanName(name);
  if (!clean) return 'Give the list a name.';
  if (clean.length > WISHLIST_NAME_MAX) return `Keep the name under ${WISHLIST_NAME_MAX} characters.`;
  const taken = lists.some((l) => l.id !== ignoreId && l.name.toLowerCase() === clean.toLowerCase());
  if (taken) return `You already have a list called "${clean}".`;
  return null;
}

export function createList(lists: readonly Wishlist[], name: string, id: string, now: number): WishlistResult {
  if (lists.length >= WISHLIST_LIMIT) return { ok: false, error: `You can have up to ${WISHLIST_LIMIT} lists.` };
  const error = validateName(name, lists);
  if (error) return { ok: false, error };
  return { ok: true, id, lists: [{ id, name: cleanName(name), createdAt: now, items: [] }, ...lists] };
}

export function renameList(lists: readonly Wishlist[], id: string, name: string): WishlistResult {
  if (!lists.some((l) => l.id === id)) return { ok: false, error: 'That list no longer exists.' };
  const error = validateName(name, lists, id);
  if (error) return { ok: false, error };
  return { ok: true, id, lists: lists.map((l) => (l.id === id ? { ...l, name: cleanName(name) } : l)) };
}

export function deleteList(lists: readonly Wishlist[], id: string): Wishlist[] {
  return lists.filter((l) => l.id !== id);
}

/** Add products to a list. Products already in it stay where they are (no duplicates). */
export function addToList(
  lists: readonly Wishlist[],
  id: string,
  productIds: readonly string[],
  now: number,
): Wishlist[] {
  return lists.map((l) => {
    if (l.id !== id) return l;
    const existing = new Set(l.items.map((i) => i.productId));
    const fresh = [...new Set(productIds)]
      .filter((p) => !existing.has(p))
      .map((productId) => ({ productId, addedAt: now }));
    return fresh.length ? { ...l, items: [...fresh, ...l.items] } : l;
  });
}

export function removeFromList(lists: readonly Wishlist[], id: string, productIds: readonly string[]): Wishlist[] {
  const drop = new Set(productIds);
  return lists.map((l) => (l.id === id ? { ...l, items: l.items.filter((i) => !drop.has(i.productId)) } : l));
}

/** Lists that contain the product. */
export function listsContaining(lists: readonly Wishlist[], productId: string): Wishlist[] {
  return lists.filter((l) => l.items.some((i) => i.productId === productId));
}
