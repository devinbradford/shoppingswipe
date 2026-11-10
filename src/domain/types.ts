/**
 * Shared domain types.
 *
 * These mirror the SQL schema in `supabase/migrations/`. If you change a field
 * here, change the matching column there (and vice versa).
 */

/** Rooms. The MVP is furniture only, organised the way people shop for it. */
export const CATEGORY_IDS = ['bedroom', 'living-room', 'kitchen-dining'] as const;

/** `categories.id`: a room. */
export type CategoryId = (typeof CATEGORY_IDS)[number];

/** Product types within a room. */
export const SUBCATEGORY_IDS = [
  'bed-frames',
  'nightstands',
  'dressers',
  'sofas',
  'accent-chairs',
  'coffee-tables',
  'tv-stands',
  'rugs',
  'bar-stools',
  'dining-tables',
  'dining-chairs',
] as const;

/** `subcategories.id`: a product type such as sofas or nightstands. */
export type SubcategoryId = (typeof SUBCATEGORY_IDS)[number];

/** Row in `subcategories`. */
export interface Subcategory {
  id: SubcategoryId;
  categoryId: CategoryId;
  label: string;
  sortOrder: number;
}

/** Row in `categories`. */
export interface Category {
  id: CategoryId;
  label: string;
  sortOrder: number;
}

/** Row in `retailers`. */
export interface Retailer {
  id: string;
  name: string;
  /** Bare domain, e.g. `fernandfold.example.com`. */
  domain: string;
}

/** Row in `products`. */
export interface Product {
  id: string;
  categoryId: CategoryId;
  subcategoryId: SubcategoryId;
  retailerId: string;
  title: string;
  brand: string;
  description: string;
  /** Price in the smallest currency unit (cents). */
  priceCents: number;
  /** ISO 4217 code. */
  currency: string;
  /** First image is the hero. */
  imageUrls: string[];
  /** Retailer product page. Always sent through the link rewriter before opening. */
  productUrl: string;
  styleTags: string[];
  material: string;
  color: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /**
   * What the nightly import measured about each photo (`products.image_meta`), in the
   * same order as `imageUrls`. Missing or null = not measured: show the whole photo.
   */
  imageMeta?: (PhotoMeta | null)[];
}

/**
 * One measured product photo. Only read, never changes the photo: the app uses it to
 * draw cut-out furniture larger inside its card without cutting any of it off.
 */
export interface PhotoMeta {
  /** The photo link this was measured from (ignored if the product's link has changed). */
  url: string;
  /** Photo width ÷ height. */
  ratio: number;
  /** Colour of the photo's plain edge, "#RRGGBB" (fills the card so the edges disappear). */
  bg: string;
  /** "cutout": furniture on a plain light background. "scene": anything else, e.g. a room photo. */
  kind: 'cutout' | 'scene';
  /** Cut-outs only, when it's safe to use: where the furniture sits, as fractions of the photo [x, y, w, h]. */
  box?: [number, number, number, number];
  /** Why a cut-out has no box ("touches-edge", "too-small", "no-gain"). */
  note?: string;
}

export type SwipeDirection = 'keep' | 'skip';

/** Row in `swipes`. The swipe log is the source of truth for taste. */
export interface SwipeEvent {
  /** Made on the phone (`swipes.client_id`), so a swipe synced twice is stored once and undo can find it. */
  id: string;
  productId: string;
  categoryId: CategoryId;
  direction: SwipeDirection;
  /** Epoch milliseconds. */
  swipedAt: number;
}

/** Row in `saved_items`: products the user has kept. */
export interface SavedItem {
  productId: string;
  /** Epoch milliseconds. */
  savedAt: number;
}

/** A product type plus how many of its products the user hasn't swiped yet. */
export interface SubcategorySummary extends Subcategory {
  totalCount: number;
  remainingCount: number;
  coverUrl?: string;
}

/** A room, its product types and how many products are left to swipe in it. */
export interface CategorySummary extends Category {
  totalCount: number;
  remainingCount: number;
  subcategories: SubcategorySummary[];
}

/** Row in `wishlist_items`. */
export interface WishlistItem {
  productId: string;
  /** Epoch milliseconds. */
  addedAt: number;
}

/** Row in `wishlists` (with its items). A named list the user organises kept items into. */
export interface Wishlist {
  id: string;
  name: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Newest first. */
  items: WishlistItem[];
}
