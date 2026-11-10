/**
 * Translation between database rows (snake_case, ISO dates) and the app's
 * types (camelCase, epoch ms). Pure, so it can be unit-tested.
 */
import type {
  Category,
  CategoryId,
  PhotoMeta,
  Product,
  Retailer,
  SavedItem,
  Subcategory,
  SubcategoryId,
  SwipeDirection,
  SwipeEvent,
  Wishlist,
} from '@/domain/types';
import type { ProfileState } from '@/sync/types';

export interface ProductRow {
  id: string;
  category_id: string;
  subcategory_id: string;
  retailer_id: string;
  title: string;
  brand: string;
  description: string;
  price_cents: number;
  currency: string;
  image_urls: string[] | null;
  product_url: string;
  style_tags: string[] | null;
  material: string;
  color: string;
  created_at: string;
  /** Added Nov 2026 (photo measurements); absent on databases without that migration. */
  image_meta?: (PhotoMeta | null)[] | null;
}

export const PRODUCT_COLUMNS =
  'id, category_id, subcategory_id, retailer_id, title, brand, description, price_cents, currency, image_urls, product_url, style_tags, material, color, created_at';
/** The same plus photo measurements (falls back to PRODUCT_COLUMNS if the column isn't there yet). */
export const PRODUCT_COLUMNS_WITH_META = `${PRODUCT_COLUMNS}, image_meta`;

export function productFromRow(r: ProductRow): Product {
  return {
    id: r.id,
    categoryId: r.category_id as CategoryId,
    subcategoryId: r.subcategory_id as SubcategoryId,
    retailerId: r.retailer_id,
    title: r.title,
    brand: r.brand,
    description: r.description ?? '',
    priceCents: r.price_cents,
    currency: r.currency ?? 'USD',
    imageUrls: r.image_urls ?? [],
    productUrl: r.product_url,
    styleTags: r.style_tags ?? [],
    material: r.material ?? '',
    color: r.color ?? '',
    createdAt: r.created_at,
    ...(Array.isArray(r.image_meta) ? { imageMeta: r.image_meta } : {}),
  };
}

export function categoryFromRow(r: { id: string; label: string; sort_order: number }): Category {
  return { id: r.id as CategoryId, label: r.label, sortOrder: r.sort_order };
}

export function subcategoryFromRow(r: {
  id: string;
  category_id: string;
  label: string;
  sort_order: number;
}): Subcategory {
  return {
    id: r.id as SubcategoryId,
    categoryId: r.category_id as CategoryId,
    label: r.label,
    sortOrder: r.sort_order,
  };
}

export function retailerFromRow(r: { id: string; name: string; domain: string }): Retailer {
  return { id: r.id, name: r.name, domain: r.domain };
}

const ms = (iso: string) => new Date(iso).getTime();
const iso = (t: number) => new Date(t).toISOString();

export interface SwipeRow {
  client_id: string;
  product_id: string;
  category_id: string;
  direction: string;
  swiped_at: string;
}

export function swipeFromRow(r: SwipeRow): SwipeEvent {
  return {
    id: r.client_id,
    productId: r.product_id,
    categoryId: r.category_id as CategoryId,
    direction: r.direction as SwipeDirection,
    swipedAt: ms(r.swiped_at),
  };
}

export function swipeToRow(s: SwipeEvent): SwipeRow {
  return {
    client_id: s.id,
    product_id: s.productId,
    category_id: s.categoryId,
    direction: s.direction,
    swiped_at: iso(s.swipedAt),
  };
}

export function savedFromRow(r: { product_id: string; saved_at: string }): SavedItem {
  return { productId: r.product_id, savedAt: ms(r.saved_at) };
}

export function savedToRow(s: SavedItem) {
  return { product_id: s.productId, saved_at: iso(s.savedAt) };
}

export interface WishlistRow {
  id: string;
  name: string;
  created_at: string;
  wishlist_items: { product_id: string; added_at: string }[] | null;
}

export function wishlistFromRow(r: WishlistRow): Wishlist {
  return {
    id: r.id,
    name: r.name,
    createdAt: ms(r.created_at),
    items: (r.wishlist_items ?? [])
      .map((i) => ({ productId: i.product_id, addedAt: ms(i.added_at) }))
      .sort((a, b) => b.addedAt - a.addedAt),
  };
}

export function wishlistToRow(l: { id: string; name: string; createdAt: number }) {
  return { id: l.id, name: l.name, created_at: iso(l.createdAt) };
}

export function wishlistItemToRow(listId: string, i: { productId: string; addedAt: number }) {
  return { wishlist_id: listId, product_id: i.productId, added_at: iso(i.addedAt) };
}

export function profileFromRow(r: { style_picks: string[] | null; onboarded: boolean }): ProfileState {
  return { stylePicks: r.style_picks ?? [], onboarded: r.onboarded };
}

export function profileToRow(p: ProfileState) {
  return { style_picks: p.stylePicks, onboarded: p.onboarded, updated_at: new Date().toISOString() };
}
