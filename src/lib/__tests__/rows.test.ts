import { generateCatalog } from '@/data/sample/catalog';
import {
  productFromRow,
  savedFromRow,
  savedToRow,
  swipeFromRow,
  swipeToRow,
  wishlistFromRow,
  wishlistItemToRow,
  wishlistToRow,
  type ProductRow,
} from '../rows';

describe('database row translation', () => {
  it('reads a product row into the app shape (and back is lossless)', () => {
    const p = generateCatalog()[0];
    const row: ProductRow = {
      id: p.id,
      category_id: p.categoryId,
      subcategory_id: p.subcategoryId,
      retailer_id: p.retailerId,
      title: p.title,
      brand: p.brand,
      description: p.description,
      price_cents: p.priceCents,
      currency: p.currency,
      image_urls: p.imageUrls,
      product_url: p.productUrl,
      style_tags: p.styleTags,
      material: p.material,
      color: p.color,
      created_at: p.createdAt,
    };
    expect(productFromRow(row)).toEqual(p);
    expect(productFromRow({ ...row, image_urls: null, style_tags: null }).imageUrls).toEqual([]);
  });

  it('round-trips swipes and kept items, keeping the phone-made id and the time', () => {
    const s = {
      id: 'abc',
      productId: 'sofas-0001',
      categoryId: 'living-room' as const,
      direction: 'keep' as const,
      swipedAt: 1_700_000_000_123,
    };
    expect(swipeFromRow(swipeToRow(s))).toEqual(s);
    const k = { productId: 'sofas-0001', savedAt: 1_700_000_000_456 };
    expect(savedFromRow(savedToRow(k))).toEqual(k);
  });

  it('reads lists with their items newest first', () => {
    const list = { id: 'l1', name: 'Living room', createdAt: 1_700_000_000_000 };
    const row = {
      ...wishlistToRow(list),
      wishlist_items: [
        wishlistItemToRow('l1', { productId: 'a', addedAt: 1 }),
        wishlistItemToRow('l1', { productId: 'b', addedAt: 5 }),
      ],
    };
    expect(wishlistFromRow(row)).toEqual({
      ...list,
      items: [
        { productId: 'b', addedAt: 5 },
        { productId: 'a', addedAt: 1 },
      ],
    });
  });
});
