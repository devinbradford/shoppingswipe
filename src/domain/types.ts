/**
 * Shared domain types.
 *
 * These mirror the SQL schema in `supabase/migrations/`. If you change a field
 * here, change the matching column there (and vice versa).
 */

export const CATEGORY_IDS = ['furniture', 'clothing', 'bedding', 'collectibles', 'decor', 'footwear'] as const;

/** `categories.id` */
export type CategoryId = (typeof CATEGORY_IDS)[number];

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
}

export type SwipeDirection = 'keep' | 'skip';

/** Row in `swipes`. The swipe log is the source of truth for taste. */
export interface SwipeEvent {
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

/** A category plus how many of its products the user hasn't swiped yet. */
export interface CategorySummary extends Category {
  totalCount: number;
  remainingCount: number;
}
