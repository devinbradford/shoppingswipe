import type { Wishlist } from '../types';
import {
  addToList,
  cleanName,
  createList,
  deleteList,
  listsContaining,
  removeFromList,
  renameList,
  validateName,
  WISHLIST_LIMIT,
} from '../wishlists';

function make(names: string[]): Wishlist[] {
  return names.map((name, i) => ({ id: `l${i}`, name, createdAt: i, items: [] }));
}

describe('wishlist names', () => {
  it('trims and collapses spaces', () => {
    expect(cleanName('  Living   room ')).toBe('Living room');
  });

  it('rejects empty, too long and duplicate names (case-insensitive)', () => {
    const lists = make(['Living room']);
    expect(validateName('   ', lists)).toMatch(/name/);
    expect(validateName('x'.repeat(41), lists)).toMatch(/40/);
    expect(validateName('living ROOM', lists)).toMatch(/already/);
    expect(validateName('Bedroom', lists)).toBeNull();
  });

  it('lets a list keep its own name when renaming', () => {
    const lists = make(['Living room']);
    expect(validateName('living room', lists, 'l0')).toBeNull();
  });
});

describe('create, rename, delete', () => {
  it('creates a new list at the top', () => {
    const r = createList(make(['A']), ' Gifts ', 'new', 100);
    expect(r.ok && r.lists.map((l) => l.name)).toEqual(['Gifts', 'A']);
  });

  it('refuses invalid names and caps the number of lists', () => {
    expect(createList(make(['Gifts']), 'gifts', 'x', 1).ok).toBe(false);
    const many = make(Array.from({ length: WISHLIST_LIMIT }, (_, i) => `L${i}`));
    expect(createList(many, 'One more', 'x', 1).ok).toBe(false);
  });

  it('renames only the target list', () => {
    const r = renameList(make(['A', 'B']), 'l1', 'Bedroom');
    expect(r.ok && r.lists.map((l) => l.name)).toEqual(['A', 'Bedroom']);
    expect(renameList(make(['A', 'B']), 'l1', 'a').ok).toBe(false);
    expect(renameList(make(['A']), 'missing', 'Z').ok).toBe(false);
  });

  it('deletes a list', () => {
    expect(deleteList(make(['A', 'B']), 'l0').map((l) => l.id)).toEqual(['l1']);
  });
});

describe('items', () => {
  it('adds without duplicates, newest first', () => {
    let lists = addToList(make(['A']), 'l0', ['p1', 'p2'], 1);
    lists = addToList(lists, 'l0', ['p2', 'p3', 'p3'], 2);
    expect(lists[0].items.map((i) => i.productId)).toEqual(['p3', 'p1', 'p2']);
  });

  it('removes items and finds lists containing a product', () => {
    let lists = addToList(make(['A', 'B']), 'l0', ['p1', 'p2'], 1);
    lists = addToList(lists, 'l1', ['p1'], 1);
    expect(listsContaining(lists, 'p1').map((l) => l.id)).toEqual(['l0', 'l1']);
    lists = removeFromList(lists, 'l0', ['p1']);
    expect(lists[0].items.map((i) => i.productId)).toEqual(['p2']);
    expect(listsContaining(lists, 'p1').map((l) => l.id)).toEqual(['l1']);
  });
});
